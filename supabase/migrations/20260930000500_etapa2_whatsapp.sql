-- Etapa 2 · WhatsApp e convite
-- Conversa, fila de envios com prioridade por nota, perguntas para a live, alertas ao humano,
-- base antiga (trilha própria), disparos idempotentes e configuração dos modelos aprovados na Meta.

-- ---------------------------------------------------------------------------
-- Leads: estado da conversa e marcos do WhatsApp
-- ---------------------------------------------------------------------------
alter table public.leads add column if not exists estado_conversa text not null default 'inicio';
alter table public.leads add column if not exists pergunta_live text;
alter table public.leads add column if not exists presenca_confirmada_em timestamptz;
alter table public.leads add column if not exists convidado_em timestamptz;
alter table public.leads add column if not exists ultima_msg_lead_em timestamptz;
alter table public.leads add column if not exists ultima_msg_empresa_em timestamptz;
alter table public.leads add column if not exists humano_pendente_em timestamptz;
alter table public.leads add column if not exists humano_assumido_por text;
alter table public.leads add column if not exists assistiu_em timestamptz;
alter table public.leads add column if not exists viu_gravacao_em timestamptz;
alter table public.leads add column if not exists base_antiga boolean not null default false;
alter table public.leads add column if not exists base_antiga_ultimo_contato date;
alter table public.leads add column if not exists base_antiga_prioridade text;
alter table public.leads add column if not exists base_antiga_canal text;
alter table public.leads add column if not exists base_antiga_gancho text;
alter table public.leads add column if not exists base_antiga_convertido_em timestamptz;
alter table public.leads add column if not exists wa_invalido_em timestamptz;
-- Base antiga sem celular válido entra só com e-mail. O cadastro pela LP continua exigindo WhatsApp (validado na function).
alter table public.leads alter column whatsapp drop not null;
comment on column public.leads.base_antiga_convertido_em is 'Lead da base antiga que se cadastrou pela LP: consentimento novo registrado, segue o fluxo normal (Circular e convite).';
alter table public.leads drop constraint if exists leads_estado_conversa;
alter table public.leads add constraint leads_estado_conversa check (estado_conversa in ('inicio','convidado','aguardando_intencao','conversa','humano','encerrada'));
comment on column public.leads.estado_conversa is 'inicio -> convidado (convite enviado) -> aguardando_intencao (respondeu) -> conversa (livre) | humano (passou para pessoa) | encerrada (saiu)';
comment on column public.leads.pergunta_live is 'O que o lead imagina fazer / pergunta para a Marcela responder ao vivo. Fonte da seleção de perguntas.';

-- ---------------------------------------------------------------------------
-- Mensagens: tudo que entra e sai, por canal
-- ---------------------------------------------------------------------------
create table if not exists public.mensagens (
  id                   bigserial primary key,
  lead_id              uuid references public.leads(id) on delete cascade,
  canal                text not null default 'whatsapp',   -- whatsapp | email
  direcao              text not null,                       -- in | out
  tipo                 text not null,                       -- template | texto | botao | audio | interativo | status
  modelo               text,                                -- nome do template (out) / id do botão (in)
  corpo                text,
  provedor_id          text,                                -- wamid / id do e-mail
  status               text not null default 'enviado',     -- enviado | entregue | lido | falhou | recebido
  erro                 text,
  iniciada_pela_empresa boolean not null default false,     -- conta no limite semanal
  fila_id              bigint,
  bruto                jsonb,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);
create index if not exists mensagens_lead_idx on public.mensagens (lead_id, criado_em desc);
create unique index if not exists mensagens_provedor_idx on public.mensagens (provedor_id) where provedor_id is not null;
create index if not exists mensagens_status_idx on public.mensagens (status, criado_em desc);
drop trigger if exists trg_mensagens_touch on public.mensagens;
create trigger trg_mensagens_touch before update on public.mensagens for each row execute function public.touch_atualizado_em();

-- Mensagens iniciadas pela empresa nos últimos 7 dias (regra: máximo config.msgs_max_semana)
create or replace function public.mensagens_empresa_semana(p_lead uuid)
returns integer language sql stable as $$
  select count(*)::integer from public.mensagens
  where lead_id = p_lead and direcao = 'out' and iniciada_pela_empresa and criado_em > now() - interval '7 days'
$$;

-- Janela de 24h: o lead respondeu nas últimas 24h? (fora dela, só template aprovado)
create or replace function public.lead_em_janela(p_lead uuid)
returns boolean language sql stable as $$
  select coalesce((select ultima_msg_lead_em > now() - interval '24 hours' from public.leads where id = p_lead), false)
$$;

-- ---------------------------------------------------------------------------
-- Fila de envios: prioridade por nota, não por ordem de chegada
-- ---------------------------------------------------------------------------
create table if not exists public.fila_envios (
  id            bigserial primary key,
  lead_id       uuid not null references public.leads(id) on delete cascade,
  tipo          text not null,           -- convite | lembrete_live | lembrete_live_pergunta | gravacao | circular_lembrete | base_antiga | base_antiga_email | texto
  canal         text not null default 'whatsapp',
  prioridade    numeric not null default 0,
  agendado_para timestamptz not null default now(),
  status        text not null default 'pendente',   -- pendente | processando | enviado | falhou | cancelado | pulado
  tentativas    integer not null default 0,
  motivo        text,
  payload       jsonb,
  criado_em     timestamptz not null default now(),
  processado_em timestamptz
);
create index if not exists fila_pendentes_idx on public.fila_envios (status, agendado_para, prioridade desc) where status = 'pendente';
create index if not exists fila_lead_idx on public.fila_envios (lead_id, tipo);

create or replace function public.fila_enfileirar(p_lead uuid, p_tipo text, p_quando timestamptz default now(), p_canal text default 'whatsapp', p_payload jsonb default null)
returns bigint language plpgsql as $$
declare
  v_id bigint;
  v_nota numeric;
begin
  -- Sem duplicar o mesmo tipo pendente para o mesmo lead.
  select id into v_id from public.fila_envios where lead_id = p_lead and tipo = p_tipo and status = 'pendente' limit 1;
  if v_id is not null then return v_id; end if;
  select nota into v_nota from public.leads where id = p_lead;
  insert into public.fila_envios (lead_id, tipo, canal, prioridade, agendado_para, payload)
    values (p_lead, p_tipo, p_canal, coalesce(v_nota, 0), p_quando, p_payload)
    returning id into v_id;
  return v_id;
end $$;

-- Próximos itens: trava a linha (skip locked) e marca como processando.
create or replace function public.fila_proximos(p_limite integer default 20)
returns setof public.fila_envios language plpgsql as $$
begin
  return query
  with sel as (
    select f.id from public.fila_envios f
    join public.leads l on l.id = f.lead_id
    where f.status = 'pendente' and f.agendado_para <= now() and l.optout_em is null
    order by f.prioridade desc, f.agendado_para asc
    limit p_limite
    for update of f skip locked
  )
  update public.fila_envios f set status = 'processando', tentativas = f.tentativas + 1
  from sel where f.id = sel.id
  returning f.*;
end $$;

-- "Sair" interrompe tudo: cancela a fila pendente do lead.
create or replace function public.leads_apos_optout()
returns trigger language plpgsql as $$
begin
  if new.optout_em is not null and (old.optout_em is null) then
    update public.fila_envios set status = 'cancelado', motivo = 'optout', processado_em = now()
      where lead_id = new.id and status in ('pendente','processando');
    new.estado_conversa := 'encerrada';
  end if;
  return new;
end $$;
drop trigger if exists trg_leads_optout on public.leads;
create trigger trg_leads_optout before update of optout_em on public.leads for each row execute function public.leads_apos_optout();

-- Convite em até 2 minutos: enfileirado no cadastro; o worker roda a cada minuto.
-- Grupo de controle fica fora. Base antiga tem trilha própria (enfileirada pela importação).
create or replace function public.leads_apos_cadastro()
returns trigger language plpgsql as $$
declare
  v_canal text := coalesce(public.config_text('canal_aquecimento'), 'whatsapp');
begin
  if new.grupo_controle or new.base_antiga or new.optout_em is not null then return new; end if;
  perform public.fila_enfileirar(new.id, 'convite', now(), v_canal);
  return new;
end $$;
drop trigger if exists trg_leads_cadastro on public.leads;
create trigger trg_leads_cadastro after insert on public.leads for each row execute function public.leads_apos_cadastro();

-- ---------------------------------------------------------------------------
-- Perguntas para a live, alertas ao humano, disparos e base antiga
-- ---------------------------------------------------------------------------
create table if not exists public.perguntas_live (
  id           bigserial primary key,
  lead_id      uuid not null references public.leads(id) on delete cascade,
  turma        text,
  texto        text not null,
  nome         text not null,
  cidade       text,
  selecionada  boolean not null default false,
  ordem        integer,
  motivo       text,
  selecionada_por text,          -- agente | humano
  criado_em    timestamptz not null default now(),
  unique (lead_id)
);

create table if not exists public.alertas (
  id           bigserial primary key,
  lead_id      uuid references public.leads(id) on delete cascade,
  tipo         text not null,        -- humano_necessario | numero_bloqueado | fila_pausada | erro
  resumo       text not null,
  cartao       jsonb,                -- cartão-resumo: nome, cidade, negócio, perguntas, nota, histórico
  status       text not null default 'aberto',   -- aberto | assumido | resolvido
  assumido_por text,
  criado_em    timestamptz not null default now(),
  resolvido_em timestamptz
);
create index if not exists alertas_abertos_idx on public.alertas (status, criado_em desc);

create table if not exists public.disparos (
  chave        text primary key,     -- ex.: lembrete_live:2026-10-15, gravacao:2026-10-15
  executado_em timestamptz not null default now(),
  total        integer not null default 0
);

-- public.base_antiga: tabela de preparação criada na migration 20260930000460_base_antiga.sql.

-- Cartão-resumo para passagem ao humano
create or replace function public.lead_cartao(p_lead uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'lead_id', l.id, 'nome', l.nome, 'whatsapp', l.whatsapp, 'email', l.email, 'cidade', l.cidade,
    'tem_negocio', l.tem_negocio, 'intencao', l.intencao, 'pergunta_live', l.pergunta_live,
    'nota', l.nota, 'faixa', l.faixa, 'status_funil', l.status_funil, 'turma', l.turma, 'origem', l.origem,
    'circular_confirmada_em', l.circular_confirmada_em, 'pagamento_liberado_em', l.pagamento_liberado_em,
    'historico', (select coalesce(jsonb_agg(jsonb_build_object('em', m.criado_em, 'dir', m.direcao, 'texto', left(m.corpo, 300)) order by m.criado_em desc), '[]'::jsonb)
                  from (select * from public.mensagens where lead_id = l.id order by criado_em desc limit 12) m)
  ) from public.leads l where l.id = p_lead
$$;

-- ---------------------------------------------------------------------------
-- Configuração da etapa 2
-- ---------------------------------------------------------------------------
insert into public.config (chave, valor, publico, descricao) values
  ('wa_tpl_convite',               '"konioca_convite_live"',        false, 'Template Meta: convite após o cadastro'),
  ('wa_tpl_lembrete_live',         '"konioca_lembrete_live"',       false, 'Template Meta: 1h antes, com o link'),
  ('wa_tpl_lembrete_live_pergunta','"konioca_lembrete_live_pergunta"', false, 'Template Meta: 1h antes, citando a pergunta selecionada'),
  ('wa_tpl_gravacao',              '"konioca_gravacao"',            false, 'Template Meta: gravação no dia seguinte para quem não assistiu'),
  ('wa_tpl_circular_lembrete',     '"konioca_circular_lembrete"',   false, 'Template Meta: lembrete de confirmação da Circular'),
  ('wa_tpl_base_antiga',           '"konioca_base_antiga"',         false, 'Template Meta: base antiga (convite para entrar na lista), uma tentativa'),
  ('wa_idioma',                    '"pt_BR"',                       false, 'Idioma dos templates'),
  ('wa_envios_por_minuto',         '20',    false, 'Aquecimento do número: teto por minuto (subir aos poucos)'),
  ('wa_envios_por_dia',            '500',   false, 'Aquecimento do número: teto por dia'),
  ('wa_pausa_falhas_pct',          '15',    false, 'Pausa a fila se as falhas na última hora passarem deste percentual (qualidade do número)'),
  ('wa_base_antiga_por_hora',      '30',    false, 'Base antiga: lotes pequenos por hora'),
  ('wa_audios',                    '{}',    false, 'Áudios pré-gravados da Marcela por situação: {"convite":"<media_id>","pos_live":"<media_id>"}'),
  ('msgs_tipos_isentos',           '["convite","lembrete_live","lembrete_live_pergunta","gravacao","circular_lembrete","base_antiga","base_antiga_email"]', false, 'Toques fixos do funil que não contam no limite semanal (o limite vale para os follow-ups do agente)'),
  ('horario_comercial',            '{"dias":[1,2,3,4,5],"inicio":"09:00","fim":"18:00","fuso":"America/Sao_Paulo"}', false, 'Janela em que o time responde; fora dela o agente informa quando o time retoma'),
  ('humano_meta_min',              '15',    false, 'Meta de resposta humana no horário comercial (minutos)'),
  ('alerta_email',                 '"[EMAIL DO TIME PARA ALERTAS]"', false, 'Destino dos alertas de passagem ao humano (WhatsApp do time chega na etapa 3)'),
  ('turmas',                       '[{"nome":"Turma de quinta · 15/10","live":"2026-10-15T19:00:00-03:00","subgrupo_link":"https://chat.whatsapp.com/[SUBGRUPO-15-10]"}]', false, 'Subgrupos da Comunidade por turma de live'),
  ('live_gravacao_link',           '"[LINK DA GRAVAÇÃO]"', false, 'Gravação da live, enviada no dia seguinte a quem não assistiu'),
  ('lembrete_live_min_antes',      '60',    false, 'Minutos antes da live para o lembrete com o link'),
  ('gravacao_hora',                '"10:00"', false, 'Hora (São Paulo) do envio da gravação no dia seguinte'),
  ('circular_lembrete_canal',      '"email"', false, 'email | whatsapp | ambos. WhatsApp só com o template aprovado'),
  ('base_antiga_whatsapp_apos_horas', '48', false, 'Base antiga P2: horas depois do e-mail para entrar nos lotes de WhatsApp'),
  ('base_antiga_email_lote',       '150',   false, 'Base antiga: e-mails por lote (aquecimento do domínio de envio)'),
  ('base_antiga_email_intervalo_min', '60', false, 'Base antiga: minutos entre lotes de e-mail'),
  ('perguntas_live_qtd',           '8',     false, 'Quantas perguntas selecionar para a Marcela responder ao vivo'),
  ('claude_modelo',                '"claude-opus-5-5"', false, 'Modelo da API do Claude para as rotinas do agente')
on conflict (chave) do update set publico = excluded.publico, descricao = excluded.descricao;

-- Fila a cada minuto; disparos da live a cada 5; perguntas às 08:00 SP (11:00 UTC); base antiga a cada 30 min.
select cron.schedule('fila-processar', '* * * * *', $$ select public.chamar_function('fila-processar') $$);
select cron.schedule('live-disparos', '*/5 * * * *', $$ select public.chamar_function('live-disparos') $$);
select cron.schedule('perguntas-selecionar', '0 11 * * *', $$ select public.chamar_function('perguntas-selecionar') $$);
select cron.schedule('base-antiga-processar', '*/30 * * * *', $$ select public.chamar_function('base-antiga-processar') $$);

insert into storage.buckets (id, name, public) values ('imports', 'imports', false) on conflict (id) do nothing;
alter table public.mensagens      enable row level security;
alter table public.fila_envios    enable row level security;
alter table public.perguntas_live enable row level security;
alter table public.alertas        enable row level security;
alter table public.disparos       enable row level security;
alter table public.base_antiga    enable row level security;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Base antiga: promoção da tabela de preparação para leads, com a regra da planilha.
--   whatsapp_email              (P1): e-mail e WhatsApp (uma tentativa)
--   email_depois_whatsapp_lotes (P2): e-mail; WhatsApp em lotes depois (base-antiga-processar)
--   email_whatsapp_se_clicar    (P3, P4): e-mail; WhatsApp só para quem clicar
-- Sem celular válido: só e-mail. Linhas marcadas para revisão ficam de fora. 10% vão para o grupo de controle.
-- ---------------------------------------------------------------------------
create or replace function public.base_antiga_promover(p_limite integer default 2000)
returns table (criados integer, vinculados integer, na_fila_email integer, na_fila_whatsapp integer, controle integer)
language plpgsql as $$
declare
  r record;
  v_lead uuid;
  v_gc boolean;
  v_pct numeric := coalesce(public.config_num('grupo_controle_pct'), 0.10);
  v_lote integer := greatest(1, coalesce(public.config_num('base_antiga_email_lote'), 150)::integer);
  v_int integer := coalesce(public.config_num('base_antiga_email_intervalo_min'), 60)::integer;
  v_turma text := public.config_text('turma_atual');
  n_criados integer := 0; n_vinc integer := 0; n_email integer := 0; n_wa integer := 0; n_gc integer := 0;
begin
  for r in
    select * from public.base_antiga
    where status = 'importado' and not revisar
    order by prioridade, ultimo_contato desc nulls last, id
    limit p_limite
    for update skip locked
  loop
    select l.id into v_lead from public.leads l
      where lower(l.email) = r.email_norm or (r.whatsapp_e164 is not null and l.whatsapp = r.whatsapp_e164)
      limit 1;
    if v_lead is not null then
      update public.base_antiga set status = 'lead_criado', lead_id = v_lead, erro = 'já era lead' where id = r.id;
      update public.leads set base_antiga = true, base_antiga_prioridade = coalesce(base_antiga_prioridade, r.prioridade),
        base_antiga_gancho = coalesce(base_antiga_gancho, r.gancho) where id = v_lead;
      n_vinc := n_vinc + 1;
      continue;
    end if;

    v_gc := random() < v_pct;
    insert into public.leads (
      nome, whatsapp, email, cidade, consentimento_em, consentimento_texto,
      origem, utm_source, utm_medium, utm_campaign, turma, grupo_controle,
      base_antiga, base_antiga_ultimo_contato, base_antiga_prioridade, base_antiga_canal, base_antiga_gancho, wa_invalido_em
    ) values (
      coalesce(nullif(r.nome, ''), r.primeiro_nome), r.whatsapp_e164, r.email_norm,
      nullif(concat_ws(', ', r.cidade, r.uf), ''),
      coalesce(r.ultimo_contato, now()),
      'Base própria: cadastro anterior no CRM (Sults ' || coalesce(r.sults_ids, '') || '). Contato com opção de sair em toda mensagem.',
      'base_propria', 'base', case when r.canal_inicial = 'whatsapp_email' and r.whatsapp_ok then 'whatsapp' else 'email' end,
      'base_antiga_' || lower(r.prioridade), v_turma, v_gc,
      true, r.ultimo_contato::date, r.prioridade, r.canal_inicial, r.gancho,
      case when r.whatsapp_ok then null else now() end
    ) returning id into v_lead;

    insert into public.lead_eventos (lead_id, tipo, origem, dados)
      values (v_lead, 'cadastro', 'sistema', jsonb_build_object('base_antiga', true, 'prioridade', r.prioridade, 'canal', r.canal_inicial));
    update public.base_antiga set status = 'lead_criado', lead_id = v_lead, erro = null where id = r.id;
    n_criados := n_criados + 1;

    if v_gc then n_gc := n_gc + 1; continue; end if;

    -- E-mail em lotes: aquece o domínio de envio e evita pico.
    perform public.fila_enfileirar(v_lead, 'base_antiga_email', now() + make_interval(mins => (n_email / v_lote) * v_int), 'email');
    n_email := n_email + 1;
    if r.canal_inicial = 'whatsapp_email' and r.whatsapp_ok then
      perform public.fila_enfileirar(v_lead, 'base_antiga', now(), 'whatsapp');
      n_wa := n_wa + 1;
    end if;
  end loop;
  return query select n_criados, n_vinc, n_email, n_wa, n_gc;
end $$;

-- Lead da base antiga que se cadastra pela LP: é promovido (consentimento novo, fluxo normal), não tratado como duplicado.
create or replace function public.lead_cadastrar(p jsonb)
returns table (lead_id uuid, novo boolean, token text, grupo_controle boolean)
language plpgsql as $$
declare
  v_id uuid;
  v_token text;
  v_gc boolean;
  v_base boolean;
  v_conv timestamptz;
  v_pct numeric := coalesce(public.config_num('grupo_controle_pct'), 0.10);
  v_turma text := public.config_text('turma_atual');
begin
  select l.id, l.token, l.grupo_controle, l.base_antiga, l.base_antiga_convertido_em into v_id, v_token, v_gc, v_base, v_conv
    from public.leads l
    where l.whatsapp = (p->>'whatsapp') or lower(l.email) = lower(p->>'email')
    limit 1;

  if v_id is not null and v_base and v_conv is null then
    update public.leads set
      nome = p->>'nome', whatsapp = coalesce(whatsapp, p->>'whatsapp'), cidade = coalesce(p->>'cidade', cidade),
      tem_negocio = (p->>'tem_negocio')::boolean,
      consentimento_em = now(), consentimento_ip = nullif(p->>'ip','')::inet, consentimento_ua = p->>'user_agent',
      consentimento_texto = p->>'consentimento_texto',
      utm_source = coalesce(p->>'utm_source', utm_source), utm_medium = coalesce(p->>'utm_medium', utm_medium),
      utm_campaign = coalesce(p->>'utm_campaign', utm_campaign), utm_content = p->>'utm_content', utm_term = p->>'utm_term',
      fbclid = p->>'fbclid', gclid = p->>'gclid', ttclid = p->>'ttclid', referrer = p->>'referrer', landing_url = p->>'landing_url',
      fbp = p->>'fbp', fbc = p->>'fbc', wa_invalido_em = case when whatsapp is null then null else wa_invalido_em end,
      base_antiga_convertido_em = now(), turma = coalesce(turma, v_turma)
      where id = v_id;
    insert into public.lead_eventos (lead_id, tipo, origem, dados) values (v_id, 'cadastro', 'lead', jsonb_build_object('base_antiga_convertido', true, 'utm_source', p->>'utm_source'));
    -- Segue o fluxo do cadastro novo: convite (se não for controle). A Circular sai pela function.
    if not v_gc then perform public.fila_enfileirar(v_id, 'convite', now(), coalesce(public.config_text('canal_aquecimento'), 'whatsapp')); end if;
    return query select v_id, true, v_token, v_gc;
    return;
  end if;

  if v_id is not null then
    return query select v_id, false, v_token, v_gc;
    return;
  end if;

  v_gc := random() < v_pct;
  insert into public.leads (
    nome, whatsapp, email, cidade, tem_negocio,
    consentimento_em, consentimento_ip, consentimento_ua, consentimento_texto,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, gclid, ttclid, referrer, landing_url, fbp, fbc, origem, turma, grupo_controle
  ) values (
    p->>'nome', p->>'whatsapp', p->>'email', p->>'cidade', (p->>'tem_negocio')::boolean,
    now(), nullif(p->>'ip','')::inet, p->>'user_agent', p->>'consentimento_texto',
    p->>'utm_source', p->>'utm_medium', p->>'utm_campaign', p->>'utm_content', p->>'utm_term',
    p->>'fbclid', p->>'gclid', p->>'ttclid', p->>'referrer', p->>'landing_url', p->>'fbp', p->>'fbc',
    coalesce(p->>'origem','outro'), v_turma, v_gc
  ) returning leads.id, leads.token into v_id, v_token;

  insert into public.lead_eventos (lead_id, tipo, origem, dados)
    values (v_id, 'cadastro', 'lead', jsonb_build_object('origem', p->>'origem', 'utm_source', p->>'utm_source', 'utm_campaign', p->>'utm_campaign'));

  return query select v_id, true, v_token, v_gc;
end $$;

-- Funções novas desta migration: mesmas regras de acesso e search_path da 450.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
revoke execute on function public.chamar_function(text, jsonb) from service_role;
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname <> 'chamar_function'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, extensions', f.assinatura);
  end loop;
end $$;
