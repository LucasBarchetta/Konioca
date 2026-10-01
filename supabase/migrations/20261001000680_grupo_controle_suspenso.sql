-- 1/10 (tarde). Grupo de controle suspenso até a base ter 200 cadastros (decisão do Lucas). Quem já estava no grupo
-- sai dele e recebe o convite normal, nos dois canais. O percentual (grupo_controle_pct) volta a valer sozinho quando
-- a contagem passar do mínimo; nenhuma mexida manual depois.
insert into public.config (chave, valor, publico, descricao) values
  ('grupo_controle_minimo_cadastros', '200', false, 'Grupo de controle só começa a ser sorteado quando a base (sem base antiga e sem teste do Monitor) tiver este número de cadastros')
on conflict (chave) do update set valor = excluded.valor, descricao = excluded.descricao;

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
  v_minimo integer := coalesce(public.config_num('grupo_controle_minimo_cadastros'), 0)::integer;
  v_cadastros integer;
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

  -- Grupo de controle suspenso até a base ter o mínimo de cadastros (decisão de 1/10: 200). Antes disso, ninguém entra.
  select count(*) into v_cadastros from public.leads l where not l.base_antiga and not l.monitor_teste;
  v_gc := v_cadastros >= v_minimo and random() < v_pct;
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

-- Quem está no grupo de controle hoje sai dele e entra na fila do convite (e-mail e WhatsApp), como os outros.
do $$
declare r record;
begin
  for r in select id, nome from public.leads where grupo_controle and not base_antiga and not monitor_teste and optout_em is null loop
    update public.leads set grupo_controle = false where id = r.id;
    insert into public.lead_eventos (lead_id, tipo, origem, dados) values (r.id, 'grupo_controle_suspenso', 'humano', jsonb_build_object('motivo', 'base abaixo de 200 cadastros', 'em', now()));
    perform public.convite_enfileirar(r.id);
  end loop;
end $$;
