-- 30/09 (noite). NÃO aplicar antes do "sim" do Lucas: muda o cadastro repetido, o Plano B da página, a live e o convite.

-- 1) Cadastro repetido: a página de obrigado continua igual (não revela se o contato existe), nada no lead muda;
--    só fica registrada a nova tentativa, com data e hora, no lead existente.
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
    if not v_gc then perform public.fila_enfileirar(v_id, 'convite', now(), coalesce(public.config_text('canal_aquecimento'), 'whatsapp')); end if;
    return query select v_id, true, v_token, v_gc;
    return;
  end if;

  if v_id is not null then
    -- Repetição: só o registro da tentativa. Nome e dados ficam como estão; a origem da tentativa vai no evento.
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

-- 2) Lead de teste do Monitor técnico: marcado, fora da planilha, dos envios e dos pixels; apagado pelo próprio Monitor.
alter table public.leads add column if not exists monitor_teste boolean not null default false;

-- 3) Live no YouTube; Plano B da página; limite apertado para cadastro sem selo; espera do selo.
update public.config set valor = '"YouTube"' where chave = 'live_plataforma';
insert into public.config (chave, valor, publico, descricao) values
  ('cadastro_limite_ip_sem_selo', '{"max": 3, "janela_min": 30}', false, 'Limite por IP para cadastro que chega sem o selo do Turnstile verificado (token ausente)'),
  ('turnstile_espera_ms',  '15000', true,  'Quanto a página espera o selo antes de liberar o botão e mandar sem token'),
  ('planob_espera_ms',     '8000',  true,  'Plano B: tempo máximo da lead-intake antes de mostrar o WhatsApp e guardar os dados'),
  ('planob_botao',         '"Garantir minha vaga pelo WhatsApp"', true, 'Plano B: texto do botão'),
  ('planob_mensagem',      '"Oi, quero minha vaga na live da pré-venda. Meu nome é {nome}."', true, 'Plano B: mensagem pré-preenchida no WhatsApp do time'),
  ('planob_texto',         '"Nosso cadastro demorou para responder. Seus dados ficaram guardados e serão enviados de novo sozinhos. Se preferir, garanta a vaga pelo WhatsApp agora."', true, 'Plano B: aviso na página'),
  -- 4) Convite com o link da live: e-mail E WhatsApp. Se o WhatsApp oficial não estiver aprovado até a data, o item de
  --    WhatsApp é cancelado e o e-mail sozinho dá conta (regra aplicada pela fila-processar no próximo passo).
  ('convite_canais',       '["email", "whatsapp"]', false, 'Canais do convite com o link da live. A fila cria um item por canal'),
  ('convite_whatsapp_ate', '"2026-10-12T23:59:59-03:00"', false, 'Se o WhatsApp oficial não estiver ativo até aqui, os itens de convite por WhatsApp são cancelados; fica só o e-mail')
on conflict (chave) do update set descricao = excluded.descricao;
