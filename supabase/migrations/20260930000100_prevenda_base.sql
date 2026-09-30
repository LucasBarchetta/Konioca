-- Konioca · Pré-venda da nova geração · etapa 1
-- Schema base: configuração, leads, eventos, Circular, lotes/reservas (mínimo), rate limit.
-- Toda escrita passa pelas edge functions com service_role. RLS ligado, sem política para anon.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Configuração: valores e datas nunca ficam no código.
-- ---------------------------------------------------------------------------
create table if not exists public.config (
  chave         text primary key,
  valor         jsonb not null,
  publico       boolean not null default false,
  descricao     text,
  atualizado_em timestamptz not null default now()
);
comment on table public.config is 'Parâmetros da pré-venda. publico=true é exposto pela function public-config.';

create or replace function public.config_get(p_chave text)
returns jsonb language sql stable as $$
  select valor from public.config where chave = p_chave
$$;

create or replace function public.config_text(p_chave text)
returns text language sql stable as $$
  select valor #>> '{}' from public.config where chave = p_chave
$$;

create or replace function public.config_num(p_chave text)
returns numeric language sql stable as $$
  select (valor #>> '{}')::numeric from public.config where chave = p_chave
$$;

create or replace function public.touch_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_config_touch on public.config;
create trigger trg_config_touch before update on public.config
  for each row execute function public.touch_atualizado_em();

-- ---------------------------------------------------------------------------
-- Lotes e reservas (mínimo para o contador ao vivo; ganham corpo na etapa 3)
-- ---------------------------------------------------------------------------
create table if not exists public.lotes (
  id         smallint primary key,
  nome       text not null,
  tamanho    integer,                -- null = sem limite (lote extra)
  aberto_em  timestamptz,
  fechado_em timestamptz
);

create table if not exists public.leads (
  id                     uuid primary key default gen_random_uuid(),
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),
  nome                   text not null,
  whatsapp               text not null,             -- E.164, ex.: +5511990000000
  email                  text not null,
  cidade                 text,
  tem_negocio            boolean,
  intencao               text,                      -- resposta da página de obrigado
  consentimento_em       timestamptz not null,
  consentimento_ip       inet,
  consentimento_ua       text,
  consentimento_texto    text not null,
  utm_source             text,
  utm_medium             text,
  utm_campaign           text,
  utm_content            text,
  utm_term               text,
  fbclid                 text,
  gclid                  text,
  ttclid                 text,
  referrer               text,
  landing_url            text,
  origem                 text not null default 'outro',
  turma                  text,
  nota                   numeric not null default 0,
  faixa                  text not null default 'frio',
  status_funil           text not null default 'cadastrado',
  circular_enviada_em    timestamptz,
  circular_recebida_em   timestamptz,
  circular_confirmada_em timestamptz,
  pagamento_liberado_em  timestamptz,
  grupo_controle         boolean not null default false,
  optout_em              timestamptz,
  optout_motivo          text,
  token                  text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  sults_id               text,
  sults_sincronizado_em  timestamptz,
  constraint leads_whatsapp_e164 check (whatsapp ~ '^\+55[1-9][0-9][0-9]{8,9}$'),
  constraint leads_email_formato check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint leads_faixa check (faixa in ('quente','morno','frio','reativar','humano')),
  constraint leads_status_funil check (status_funil in (
    'cadastrado','circular_enviada','circular_recebida','na_comunidade','convidado',
    'confirmou_presenca','assistiu','viu_gravacao','pediu','aprovado','reservado',
    'contrato_enviado','assinado','entregue','agora_nao','saiu','recusado'
  ))
);
create unique index if not exists leads_whatsapp_unico on public.leads (whatsapp);
create unique index if not exists leads_email_unico on public.leads (lower(email));
create index if not exists leads_status_idx on public.leads (status_funil);
create index if not exists leads_origem_idx on public.leads (origem);
create index if not exists leads_pagamento_liberado_idx on public.leads (pagamento_liberado_em);
create index if not exists leads_criado_idx on public.leads (criado_em);

comment on column public.leads.circular_recebida_em is 'Marco legal de recebimento da Circular (Lei 13.966/2019). Definido pelo webhook de entrega ou pela confirmação explícita, conforme config.circular_marco_recebimento.';
comment on column public.leads.pagamento_liberado_em is 'circular_recebida_em + config.circular_prazo_dias. Nenhuma cobrança antes desta data.';

drop trigger if exists trg_leads_touch on public.leads;
create trigger trg_leads_touch before update on public.leads
  for each row execute function public.touch_atualizado_em();

-- Liberação de pagamento: calculada sempre que a data de recebimento muda.
create or replace function public.leads_calcula_liberacao()
returns trigger language plpgsql as $$
declare
  v_dias integer := coalesce(public.config_num('circular_prazo_dias'), 10)::integer;
begin
  if new.circular_recebida_em is null then
    new.pagamento_liberado_em := null;
  else
    new.pagamento_liberado_em := new.circular_recebida_em + make_interval(days => v_dias);
  end if;
  return new;
end $$;

drop trigger if exists trg_leads_liberacao on public.leads;
create trigger trg_leads_liberacao before insert or update of circular_recebida_em on public.leads
  for each row execute function public.leads_calcula_liberacao();

-- Regra consultada por qualquer function antes de gerar cobrança (etapa 3) e pelos agentes.
create or replace function public.lead_pode_pagar(p_lead uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.leads
    where id = p_lead
      and optout_em is null
      and pagamento_liberado_em is not null
      and pagamento_liberado_em <= now()
  )
$$;

create table if not exists public.reservas (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id),
  lote_id       smallint not null references public.lotes(id),
  numero        integer not null,                -- posição dentro do lote ("037 de 250")
  valor         numeric not null,
  status        text not null default 'pendente', -- pendente | paga | cancelada
  criado_em     timestamptz not null default now(),
  paga_em       timestamptz,
  unique (lote_id, numero)
);
create index if not exists reservas_status_idx on public.reservas (status);

create or replace function public.reservas_confirmadas(p_lote smallint default null)
returns integer language sql stable as $$
  select count(*)::integer from public.reservas
  where status = 'paga' and (p_lote is null or lote_id = p_lote)
$$;

-- ---------------------------------------------------------------------------
-- Eventos: fonte da nota (etapa 4) e do painel (etapa 5)
-- ---------------------------------------------------------------------------
create table if not exists public.lead_eventos (
  id        bigserial primary key,
  lead_id   uuid not null references public.leads(id) on delete cascade,
  tipo      text not null,      -- cadastro, intencao, clicou_grupo, circular_enviada, circular_entregue, ...
  origem    text not null default 'sistema', -- sistema | lead | humano | agente
  dados     jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists lead_eventos_lead_idx on public.lead_eventos (lead_id, criado_em desc);
create index if not exists lead_eventos_tipo_idx on public.lead_eventos (tipo);

-- ---------------------------------------------------------------------------
-- Circular: um registro por envio de e-mail
-- ---------------------------------------------------------------------------
create table if not exists public.circular_envios (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.leads(id) on delete cascade,
  provedor       text not null default 'resend',
  provedor_id    text unique,
  email          text not null,
  arquivo        text,
  status         text not null default 'enviado', -- enviado | entregue | aberto | clicado | devolvido | falhou
  enviado_em     timestamptz not null default now(),
  entregue_em    timestamptz,
  aberto_em      timestamptz,
  clicado_em     timestamptz,
  devolvido_em   timestamptz,
  erro           text,
  eventos        jsonb not null default '[]'::jsonb
);
create index if not exists circular_envios_lead_idx on public.circular_envios (lead_id);

-- Marco de recebimento: aplica a regra da config ao lead.
-- config.circular_marco_recebimento: 'entrega' (padrão) | 'confirmacao'
create or replace function public.circular_marca_recebimento(p_lead uuid, p_evento text, p_quando timestamptz)
returns void language plpgsql as $$
declare
  v_marco text := coalesce(public.config_text('circular_marco_recebimento'), 'entrega');
  v_conta boolean := false;
begin
  if p_evento = 'confirmacao' then
    update public.leads set circular_confirmada_em = coalesce(circular_confirmada_em, p_quando) where id = p_lead;
    v_conta := true;
  elsif p_evento in ('entrega','abertura','clique') and v_marco = 'entrega' then
    v_conta := true;
  end if;

  if v_conta then
    update public.leads
      set circular_recebida_em = coalesce(circular_recebida_em, p_quando),
          status_funil = case when status_funil in ('cadastrado','circular_enviada') then 'circular_recebida' else status_funil end
      where id = p_lead;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Rate limit simples por IP (cadastro)
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limit (
  chave     text not null,
  janela    timestamptz not null,
  contagem  integer not null default 0,
  primary key (chave, janela)
);

create or replace function public.rate_limit_hit(p_chave text, p_janela_min integer, p_max integer)
returns boolean language plpgsql as $$
declare
  v_janela timestamptz := date_trunc('minute', now()) - make_interval(mins => (extract(minute from now())::integer % p_janela_min));
  v_cont integer;
begin
  insert into public.rate_limit (chave, janela, contagem) values (p_chave, v_janela, 1)
    on conflict (chave, janela) do update set contagem = public.rate_limit.contagem + 1
    returning contagem into v_cont;
  delete from public.rate_limit where janela < now() - interval '1 day';
  return v_cont <= p_max;
end $$;

-- ---------------------------------------------------------------------------
-- Cadastro atômico: insere lead, evento e sorteia grupo de controle.
-- Retorna o lead e se é novo. Duplicado devolve o existente sem alterar nada.
-- ---------------------------------------------------------------------------
create or replace function public.lead_cadastrar(p jsonb)
returns table (lead_id uuid, novo boolean, token text, grupo_controle boolean)
language plpgsql as $$
declare
  v_id uuid;
  v_token text;
  v_gc boolean;
  v_pct numeric := coalesce(public.config_num('grupo_controle_pct'), 0.10);
  v_turma text := public.config_text('turma_atual');
begin
  select l.id, l.token, l.grupo_controle into v_id, v_token, v_gc
    from public.leads l
    where l.whatsapp = (p->>'whatsapp') or lower(l.email) = lower(p->>'email')
    limit 1;
  if v_id is not null then
    return query select v_id, false, v_token, v_gc;
    return;
  end if;

  v_gc := random() < v_pct;

  insert into public.leads (
    nome, whatsapp, email, cidade, tem_negocio,
    consentimento_em, consentimento_ip, consentimento_ua, consentimento_texto,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, gclid, ttclid, referrer, landing_url, origem, turma, grupo_controle
  ) values (
    p->>'nome', p->>'whatsapp', p->>'email', p->>'cidade', (p->>'tem_negocio')::boolean,
    now(), nullif(p->>'ip','')::inet, p->>'user_agent', p->>'consentimento_texto',
    p->>'utm_source', p->>'utm_medium', p->>'utm_campaign', p->>'utm_content', p->>'utm_term',
    p->>'fbclid', p->>'gclid', p->>'ttclid', p->>'referrer', p->>'landing_url',
    coalesce(p->>'origem','outro'), v_turma, v_gc
  ) returning leads.id, leads.token into v_id, v_token;

  insert into public.lead_eventos (lead_id, tipo, origem, dados)
    values (v_id, 'cadastro', 'lead', jsonb_build_object('origem', p->>'origem', 'utm_source', p->>'utm_source', 'utm_campaign', p->>'utm_campaign'));

  return query select v_id, true, v_token, v_gc;
end $$;

-- ---------------------------------------------------------------------------
-- Views de apoio (painel virá na etapa 5; estas servem a exportação e o placar)
-- ---------------------------------------------------------------------------
create or replace view public.v_placar as
select
  (select count(*) from public.leads) as leads,
  (select count(*) from public.leads where optout_em is not null) as saidas,
  (select count(*) from public.leads where circular_recebida_em is not null) as circular_recebida,
  (select count(*) from public.leads where pagamento_liberado_em <= now()) as pagamento_liberado,
  public.reservas_confirmadas(1::smallint) as reservas_lote1,
  public.reservas_confirmadas() as reservas_total;

-- ---------------------------------------------------------------------------
-- RLS: tudo fechado. Só service_role (functions) acessa.
-- ---------------------------------------------------------------------------
alter table public.config           enable row level security;
alter table public.leads            enable row level security;
alter table public.lead_eventos     enable row level security;
alter table public.circular_envios  enable row level security;
alter table public.lotes            enable row level security;
alter table public.reservas         enable row level security;
alter table public.rate_limit       enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Storage: bucket privado da Circular e das exportações
insert into storage.buckets (id, name, public) values ('circular', 'circular', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('exports', 'exports', false)
  on conflict (id) do nothing;
