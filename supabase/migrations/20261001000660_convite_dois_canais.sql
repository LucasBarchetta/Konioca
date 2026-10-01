-- 1/10. Convite com o link da live em dois canais (e-mail E WhatsApp), decisão do Lucas.
-- NÃO aplicar antes do "sim". Regra: a fila cria um item por canal de config.convite_canais. O e-mail sai assim que
-- envios_ativos for ligado. O item de WhatsApp espera o número oficial; se até config.convite_whatsapp_ate o WhatsApp
-- não estiver ativo, a fila-processar cancela os itens de WhatsApp do convite (motivo whatsapp_nao_aprovado) e o e-mail
-- sozinho dá conta. Base antiga importada continua fora (trilha própria).

-- a) Um item por (lead, tipo, canal): antes a fila recusava um segundo item do mesmo tipo mesmo em outro canal.
create or replace function public.fila_enfileirar(p_lead uuid, p_tipo text, p_quando timestamptz default now(), p_canal text default 'whatsapp', p_payload jsonb default null)
returns bigint language plpgsql as $$
declare
  v_id bigint;
  v_nota numeric;
begin
  select id into v_id from public.fila_envios where lead_id = p_lead and tipo = p_tipo and canal = p_canal and status = 'pendente' limit 1;
  if v_id is not null then return v_id; end if;
  select nota into v_nota from public.leads where id = p_lead;
  insert into public.fila_envios (lead_id, tipo, canal, prioridade, agendado_para, payload)
    values (p_lead, p_tipo, p_canal, coalesce(v_nota, 0), p_quando, p_payload)
    returning id into v_id;
  return v_id;
end $$;

-- b) Convite da live: um item por canal da config (padrão e-mail e WhatsApp). Fonte única para o gatilho de cadastro
--    e para a conversão da base antiga pela página.
create or replace function public.convite_enfileirar(p_lead uuid)
returns void language plpgsql as $$
declare
  v_canais jsonb := coalesce((select valor from public.config where chave = 'convite_canais'), to_jsonb(array[coalesce(public.config_text('canal_aquecimento'), 'whatsapp')]));
  v_canal text;
begin
  for v_canal in select jsonb_array_elements_text(v_canais) loop
    if v_canal in ('email', 'whatsapp') then
      perform public.fila_enfileirar(p_lead, 'convite', now(), v_canal);
    end if;
  end loop;
end $$;

create or replace function public.leads_apos_cadastro()
returns trigger language plpgsql as $$
begin
  if new.grupo_controle or new.base_antiga or new.optout_em is not null then return new; end if;
  perform public.convite_enfileirar(new.id);
  return new;
end $$;
drop trigger if exists trg_leads_cadastro on public.leads;
create trigger trg_leads_cadastro after insert on public.leads for each row execute function public.leads_apos_cadastro();

-- c) lead_cadastrar: a conversão da base antiga pela página usa a mesma regra (só a linha do convite muda).
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
    if not v_gc then perform public.convite_enfileirar(v_id); end if;
    return query select v_id, true, v_token, v_gc;
    return;
  end if;

  if v_id is not null then
    insert into public.lead_eventos (lead_id, tipo, origem, dados)
      values (v_id, 'cadastro_repetido', 'lead', jsonb_build_object('em', now(), 'utm_source', p->>'utm_source', 'utm_campaign', p->>'utm_campaign', 'mesmo_whatsapp', (select l.whatsapp = (p->>'whatsapp') from public.leads l where l.id = v_id), 'mesmo_email', (select lower(l.email) = lower(p->>'email') from public.leads l where l.id = v_id)));
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

-- d) Quem já está na lista com convite só por WhatsApp pendente ganha o item de e-mail (mesma data de agendamento).
insert into public.fila_envios (lead_id, tipo, canal, prioridade, agendado_para)
select f.lead_id, 'convite', 'email', f.prioridade, f.agendado_para
from public.fila_envios f
join public.leads l on l.id = f.lead_id
where f.tipo = 'convite' and f.canal = 'whatsapp' and f.status = 'pendente'
  and l.optout_em is null and not l.grupo_controle and l.convidado_em is null and l.email is not null
  and not exists (select 1 from public.fila_envios e where e.lead_id = f.lead_id and e.tipo = 'convite' and e.canal = 'email');

update public.config set descricao = 'Canais do convite com o link da live: a fila cria um item por canal. O e-mail sai com envios_ativos; o WhatsApp espera o número oficial' where chave = 'convite_canais';

-- e) "Contatado à mão no WhatsApp": marcação por lead, com data e quem marcou. Cancela o convite por WhatsApp
--    pendente daquele lead (motivo contato_manual); o e-mail segue normal. Botão no painel da Fase A.
alter table public.leads add column if not exists contato_manual_em timestamptz;
alter table public.leads add column if not exists contato_manual_por text;

create or replace function public.lead_contato_manual(p_lead uuid, p_por text default 'time')
returns integer language plpgsql as $$
declare
  v_n integer;
begin
  update public.leads set contato_manual_em = coalesce(contato_manual_em, now()), contato_manual_por = coalesce(contato_manual_por, p_por) where id = p_lead;
  update public.fila_envios set status = 'cancelado', motivo = 'contato_manual', processado_em = now()
    where lead_id = p_lead and tipo = 'convite' and canal = 'whatsapp' and status in ('pendente', 'processando');
  get diagnostics v_n = row_count;
  insert into public.lead_eventos (lead_id, tipo, origem, dados) values (p_lead, 'contato_manual', 'humano', jsonb_build_object('por', p_por, 'convites_whatsapp_cancelados', v_n));
  return v_n;
end $$;
