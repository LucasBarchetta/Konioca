-- Acréscimos aprovados após a PR 1:
-- Turnstile, Meta Conversions API (dedupe), plano B por e-mail, Circular contada a partir do clique,
-- lembrete em 48h, data de entrega do e-mail no lead.

alter table public.leads add column if not exists circular_entregue_em timestamptz;
alter table public.leads add column if not exists circular_lembrete_em timestamptz;
alter table public.leads add column if not exists fbp text;
alter table public.leads add column if not exists fbc text;
alter table public.leads add column if not exists capi_enviado_em timestamptz;
comment on column public.leads.circular_entregue_em is 'Entrega do e-mail confirmada pelo provedor. Registro; não é o marco legal quando circular_marco_recebimento = confirmacao.';
comment on column public.leads.circular_lembrete_em is 'Lembrete enviado a quem não confirmou o recebimento da Circular no prazo (config.circular_lembrete_horas).';

-- Marco de recebimento: registra a entrega sempre; conta os 10 dias conforme a config.
create or replace function public.circular_marca_recebimento(p_lead uuid, p_evento text, p_quando timestamptz)
returns void language plpgsql as $$
declare
  v_marco text := coalesce(public.config_text('circular_marco_recebimento'), 'confirmacao');
  v_conta boolean := false;
begin
  if p_evento = 'entrega' then
    update public.leads set circular_entregue_em = coalesce(circular_entregue_em, p_quando) where id = p_lead;
  end if;

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

-- Leads que precisam de lembrete: Circular enviada há mais de N horas, sem confirmação, sem lembrete, sem opt-out.
create or replace function public.leads_para_lembrete_circular(p_horas integer, p_limite integer default 200)
returns setof public.leads language sql stable as $$
  select * from public.leads
  where circular_enviada_em is not null
    and circular_enviada_em < now() - make_interval(hours => p_horas)
    and circular_confirmada_em is null
    and circular_lembrete_em is null
    and optout_em is null
  order by circular_enviada_em asc
  limit p_limite
$$;

insert into public.config (chave, valor, publico, descricao) values
  ('turnstile_ativo',        'false', true,  'Exigir Cloudflare Turnstile no cadastro (ligar quando site key e TURNSTILE_SECRET estiverem configurados)'),
  ('turnstile_site_key',     '"[TURNSTILE SITE KEY]"', true, 'Site key pública do widget'),
  ('meta_capi_ativo',        'false', false, 'Enviar o evento Lead pela API de Conversões da Meta (precisa de META_CAPI_TOKEN e meta_pixel_id)'),
  ('meta_test_event_code',   '""',    false, 'Código de teste do Events Manager; vazio em produção'),
  ('canal_aquecimento',      '"whatsapp"', false, 'Plano B: whatsapp | email. Em email, o aquecimento da base sai por Resend em lotes até a WABA liberar'),
  ('email_lote_tamanho',     '200',   false, 'Plano B: leads por lote de e-mail'),
  ('email_lote_intervalo_min','30',   false, 'Plano B: minutos entre lotes'),
  ('circular_lembrete_horas','48',    false, 'Horas após o envio para lembrar quem não confirmou o recebimento'),
  ('circular_lembrete_assunto','"Falta um clique: sua Circular de Oferta de Franquia"', false, 'Assunto do lembrete')
on conflict (chave) do update set publico = excluded.publico, descricao = excluded.descricao;

-- Decisão aprovada: os 10 dias contam a partir do clique "Confirmo que recebi".
update public.config set valor = '"confirmacao"',
  descricao = 'Marco que conta como recebimento: confirmacao (clique do lead, padrão aprovado) ou entrega (webhook do provedor)'
  where chave = 'circular_marco_recebimento';

select cron.schedule('circular-lembrete', '30 * * * *', $$ select public.chamar_function('circular-lembrete') $$);

-- lead_cadastrar passa a gravar fbp/fbc (deduplicação e atribuição da Meta).
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
