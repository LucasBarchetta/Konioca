-- Retenção (decisão de 30/09): anonimizar, não apagar.
-- Sai nome, telefone, e-mail e identificadores (IP, navegador, cookies e cliques de anúncio, textos livres).
-- Fica o que não identifica: cidade/UF, origem e UTMs de campanha, datas, status e eventos.
-- Quem pediu para sair entra numa lista mínima de bloqueio, com telefone e e-mail em HMAC-SHA256
-- (chave aleatória só no Vault), usada apenas para nunca mais contatar.
-- Quando anonimiza:
--   pediu para sair  -> bloqueio na hora; anonimização depois de retencao_optout_horas (padrão 24h)
--   sem contato      -> anonimização depois de retencao_dias (padrão 730) do último contato, sem bloqueio
--   com pré-reserva  -> não anonimiza (registro ligado a contrato, prazo legal); só bloqueia se pediu para sair

insert into public.config (chave, valor, publico, descricao) values
  ('retencao_dias',         '730', false, 'Dias sem contato até anonimizar (política: até 2 anos após o último contato)'),
  ('retencao_optout_horas', '24',  false, 'Horas depois do pedido de saída até anonimizar (o bloqueio é imediato)')
on conflict (chave) do nothing;

-- Chave do HMAC: gerada aqui, guardada só no Vault. Nunca sai do banco.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'bloqueio_chave') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'bloqueio_chave', 'HMAC da lista de bloqueio de contato. Trocar invalida a lista.');
  end if;
end $$;

create table if not exists public.bloqueio_contato (
  id        bigint generated always as identity primary key,
  tipo      text not null check (tipo in ('whatsapp', 'email')),
  hash      text not null,
  motivo    text,
  criado_em timestamptz not null default now(),
  unique (tipo, hash)
);
alter table public.bloqueio_contato enable row level security;

create table if not exists public.retencao_log (
  id            bigint generated always as identity primary key,
  executado_em  timestamptz not null default now(),
  bloqueados    integer not null default 0,
  anon_optout   integer not null default 0,
  anon_prazo    integer not null default 0,
  anon_base     integer not null default 0,
  rate_limit    integer not null default 0
);
alter table public.retencao_log enable row level security;

alter table public.leads add column if not exists anonimizado_em timestamptz;
alter table public.leads add column if not exists bloqueado_em timestamptz;

-- Normalização antes do hash: WhatsApp só dígitos com 55; e-mail minúsculo sem espaços.
create or replace function public.contato_hash(p_tipo text, p_valor text)
returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare v text; k text;
begin
  if p_valor is null or btrim(p_valor) = '' then return null; end if;
  if p_tipo = 'whatsapp' then
    v := regexp_replace(p_valor, '\D', '', 'g');
    if length(v) in (10, 11) then v := '55' || v; end if;
  else
    v := lower(btrim(p_valor));
  end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'bloqueio_chave' limit 1;
  if k is null then raise exception 'bloqueio_chave ausente no Vault'; end if;
  return encode(extensions.hmac(v, k, 'sha256'), 'hex');
end $$;

create or replace function public.bloquear_contato(p_whatsapp text, p_email text, p_motivo text)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare n integer := 0; h text;
begin
  h := public.contato_hash('whatsapp', p_whatsapp);
  if h is not null then
    insert into public.bloqueio_contato (tipo, hash, motivo) values ('whatsapp', h, p_motivo) on conflict do nothing;
    n := n + 1;
  end if;
  h := public.contato_hash('email', p_email);
  if h is not null and p_email not like '%@anonimizado.invalid' then
    insert into public.bloqueio_contato (tipo, hash, motivo) values ('email', h, p_motivo) on conflict do nothing;
    n := n + 1;
  end if;
  return n;
end $$;

create or replace function public.contato_bloqueado(p_whatsapp text, p_email text)
returns boolean language plpgsql stable security definer set search_path = public, extensions as $$
declare hw text := public.contato_hash('whatsapp', p_whatsapp); he text := public.contato_hash('email', p_email);
begin
  return exists (select 1 from public.bloqueio_contato b
                  where (b.tipo = 'whatsapp' and b.hash = hw) or (b.tipo = 'email' and b.hash = he));
end $$;

-- Anonimiza um lead e tudo que carrega dado pessoal dele. Não toca em quem tem pré-reserva.
create or replace function public.anonimizar_lead(p_lead uuid, p_motivo text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare l record;
begin
  select id, email, whatsapp, anonimizado_em into l from public.leads where id = p_lead for update;
  if not found or l.anonimizado_em is not null then return false; end if;
  if exists (select 1 from public.reservas r where r.lead_id = p_lead) then return false; end if;

  update public.base_antiga
     set nome = 'Anonimizado', primeiro_nome = null,
         email = 'anon-b' || id || '@anonimizado.invalid',
         whatsapp_bruto = null, whatsapp_e164 = null, whatsapp_ok = false,
         sults_ids = null, observacoes = null, status = 'ignorado', erro = 'anonimizado'
   where lead_id = p_lead or email_norm = lower(btrim(l.email)) or (l.whatsapp is not null and whatsapp_e164 = l.whatsapp);
  update public.mensagens set corpo = null, bruto = null, erro = null, provedor_id = null where lead_id = p_lead;
  update public.circular_envios set email = 'anonimizado', eventos = '[]'::jsonb, erro = null, provedor_id = null where lead_id = p_lead;
  update public.fila_envios
     set payload = null,
         motivo = case when status = 'pendente' then 'anonimizado' else motivo end,
         status = case when status = 'pendente' then 'cancelado' else status end
   where lead_id = p_lead;
  update public.perguntas_live set nome = 'Anonimizado', texto = '(removido)' where lead_id = p_lead;
  update public.alertas set resumo = 'Anonimizado', cartao = null where lead_id = p_lead;
  update public.lead_eventos set dados = null where lead_id = p_lead;
  update public.leads
     set nome = 'Anonimizado', email = 'anon-' || id || '@anonimizado.invalid', whatsapp = null,
         token = 'anon-' || encode(extensions.gen_random_bytes(16), 'hex'),
         consentimento_ip = null, consentimento_ua = null,
         fbclid = null, gclid = null, ttclid = null, fbp = null, fbc = null,
         referrer = null, landing_url = null, pergunta_live = null, humano_assumido_por = null,
         sults_id = null, optout_motivo = null, anonimizado_em = now()
   where id = p_lead;
  insert into public.lead_eventos (lead_id, tipo, origem, dados) values (p_lead, 'anonimizado', 'sistema', jsonb_build_object('motivo', p_motivo));
  return true;
end $$;

-- Pedido de saída: bloqueio na hora (a anonimização vem depois, pela rotina diária).
create or replace function public.leads_bloqueia_optout()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.optout_em is not null and old.optout_em is null then
    perform public.bloquear_contato(new.whatsapp, new.email, 'optout');
  end if;
  return null;
end $$;
drop trigger if exists trg_leads_bloqueio_optout on public.leads;
create trigger trg_leads_bloqueio_optout after update of optout_em on public.leads
  for each row execute function public.leads_bloqueia_optout();

-- Cadastro novo de quem está bloqueado: entra na base, marcado, e nada automático sai para ele.
create or replace function public.leads_marca_bloqueado()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.email not like '%@anonimizado.invalid' and public.contato_bloqueado(new.whatsapp, new.email) then
    new.bloqueado_em := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_leads_marca_bloqueado on public.leads;
create trigger trg_leads_marca_bloqueado before insert or update of whatsapp, email on public.leads
  for each row execute function public.leads_marca_bloqueado();

create or replace function public.fila_respeita_bloqueio()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from public.leads l where l.id = new.lead_id and (l.bloqueado_em is not null or l.anonimizado_em is not null)) then
    new.status := 'cancelado'; new.motivo := 'bloqueio'; new.processado_em := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_fila_respeita_bloqueio on public.fila_envios;
create trigger trg_fila_respeita_bloqueio before insert on public.fila_envios
  for each row execute function public.fila_respeita_bloqueio();

-- Base antiga: quem está na lista de bloqueio nunca é importado para contato.
create or replace function public.base_antiga_respeita_bloqueio()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  -- email_norm é coluna gerada (lower(btrim(email))) e ainda não existe no BEFORE; o hash já normaliza.
  if coalesce(new.email, '') not like '%@anonimizado.invalid'
     and public.contato_bloqueado(new.whatsapp_e164, new.email) then
    new.status := 'ignorado'; new.erro := 'bloqueio';
  end if;
  return new;
end $$;
drop trigger if exists trg_base_antiga_bloqueio on public.base_antiga;
create trigger trg_base_antiga_bloqueio before insert or update of email, whatsapp_e164 on public.base_antiga
  for each row execute function public.base_antiga_respeita_bloqueio();

-- Rotina diária.
create or replace function public.retencao_executar()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_dias  integer := coalesce(public.config_num('retencao_dias'), 730)::integer;
  v_horas integer := coalesce(public.config_num('retencao_optout_horas'), 24)::integer;
  v_bloq integer := 0; v_opt integer := 0; v_prazo integer := 0; v_base integer := 0; v_rl integer := 0;
  r record;
begin
  -- Garante o bloqueio de todo pedido de saída (inclusive os anteriores a esta rotina e os com pré-reserva).
  for r in select whatsapp, email from public.leads where optout_em is not null and anonimizado_em is null loop
    v_bloq := v_bloq + public.bloquear_contato(r.whatsapp, r.email, 'optout');
  end loop;

  for r in select id from public.leads
            where optout_em is not null and anonimizado_em is null and optout_em < now() - make_interval(hours => v_horas) loop
    if public.anonimizar_lead(r.id, 'optout') then v_opt := v_opt + 1; end if;
  end loop;

  for r in select id from public.leads
            where anonimizado_em is null and optout_em is null
              and greatest(criado_em,
                           coalesce(ultima_msg_lead_em, '-infinity'), coalesce(ultima_msg_empresa_em, '-infinity'),
                           coalesce(circular_confirmada_em, '-infinity'), coalesce(presenca_confirmada_em, '-infinity'),
                           coalesce(assistiu_em, '-infinity'), coalesce(viu_gravacao_em, '-infinity'))
                  < now() - make_interval(days => v_dias) loop
    if public.anonimizar_lead(r.id, 'prazo') then v_prazo := v_prazo + 1; end if;
  end loop;

  -- Base antiga que nunca virou lead: conta o último contato registrado no Sults.
  update public.base_antiga
     set nome = 'Anonimizado', primeiro_nome = null,
         email = 'anon-b' || id || '@anonimizado.invalid',
         whatsapp_bruto = null, whatsapp_e164 = null, whatsapp_ok = false,
         sults_ids = null, observacoes = null, status = 'ignorado', erro = 'anonimizado'
   where lead_id is null and email_norm not like '%@anonimizado.invalid'
     and ultimo_contato < now() - make_interval(days => v_dias);
  get diagnostics v_base = row_count;

  -- Limite de tentativas guarda IP: não precisa passar de 2 dias.
  delete from public.rate_limit where janela < now() - interval '2 days';
  get diagnostics v_rl = row_count;

  insert into public.retencao_log (bloqueados, anon_optout, anon_prazo, anon_base, rate_limit)
  values (v_bloq, v_opt, v_prazo, v_base, v_rl);
  return jsonb_build_object('bloqueados', v_bloq, 'anon_optout', v_opt, 'anon_prazo', v_prazo, 'anon_base', v_base, 'rate_limit', v_rl);
end $$;

-- Só o servidor executa.
do $$
declare f text;
begin
  foreach f in array array[
    'public.contato_hash(text, text)', 'public.bloquear_contato(text, text, text)', 'public.contato_bloqueado(text, text)',
    'public.anonimizar_lead(uuid, text)', 'public.retencao_executar()', 'public.leads_bloqueia_optout()',
    'public.leads_marca_bloqueado()', 'public.fila_respeita_bloqueio()', 'public.base_antiga_respeita_bloqueio()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- 03h40 em São Paulo = 06h40 UTC.
select cron.unschedule('retencao-diaria') where exists (select 1 from cron.job where jobname = 'retencao-diaria');
select cron.schedule('retencao-diaria', '40 6 * * *', $$ select public.retencao_executar() $$);
