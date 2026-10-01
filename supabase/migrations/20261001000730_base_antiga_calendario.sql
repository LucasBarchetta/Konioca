-- Calendário da base antiga (decisão do Lucas em 1/10, substitui o de docs/07): P1 em 1/10, P2 em 2/10 às 9h, P3 e P4 em
-- 5/10 às 9h, cada um depois do "sim" no teste da versão. Nenhum WhatsApp para a base antiga até o número oficial ligar.
-- base_antiga_promover ganha: prioridades a promover, hora de início dos lotes e chave do WhatsApp. O grupo de controle
-- obedece ao mesmo mínimo de cadastros do lead_cadastrar (grupo_controle_minimo_cadastros).
insert into public.config (chave, valor, publico, descricao) values
  ('base_antiga_whatsapp_ativo', 'false', false, 'Base antiga só recebe WhatsApp (P1 junto com o e-mail; demais, quem clicou) com esta chave em true, depois do número oficial ligar')
on conflict (chave) do update set descricao = excluded.descricao;

drop function if exists public.base_antiga_promover(integer);
create or replace function public.base_antiga_promover(
  p_limite integer default 2000,
  p_prioridades text[] default null,          -- ex.: array['P1']; null = todas
  p_inicio timestamptz default now(),         -- primeiro lote de e-mail sai daqui; os seguintes a cada base_antiga_email_intervalo_min
  p_whatsapp boolean default null             -- null = config.base_antiga_whatsapp_ativo
) returns table (criados integer, vinculados integer, na_fila_email integer, na_fila_whatsapp integer, controle integer)
language plpgsql set search_path to 'public', 'extensions' as $$
declare
  r record;
  v_lead uuid;
  v_gc boolean;
  v_pct numeric := coalesce(public.config_num('grupo_controle_pct'), 0.10);
  v_minimo integer := coalesce(public.config_num('grupo_controle_minimo_cadastros'), 0)::integer;
  v_cadastros integer;
  v_lote integer := greatest(1, coalesce(public.config_num('base_antiga_email_lote'), 150)::integer);
  v_int integer := coalesce(public.config_num('base_antiga_email_intervalo_min'), 60)::integer;
  v_turma text := public.config_text('turma_atual');
  v_wa boolean := coalesce(p_whatsapp, (select valor::text = 'true' from public.config where chave = 'base_antiga_whatsapp_ativo'), false);
  v_inicio timestamptz := greatest(coalesce(p_inicio, now()), now());
  n_criados integer := 0; n_vinc integer := 0; n_email integer := 0; n_wa integer := 0; n_gc integer := 0;
begin
  select count(*) into v_cadastros from public.leads l where not l.base_antiga and l.optout_em is null;
  for r in
    select * from public.base_antiga
    where status = 'importado' and not revisar and (p_prioridades is null or prioridade = any (p_prioridades))
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

    v_gc := v_cadastros >= v_minimo and random() < v_pct;
    insert into public.leads (
      nome, whatsapp, email, cidade, consentimento_em, consentimento_texto,
      origem, utm_source, utm_medium, utm_campaign, utm_content, turma, grupo_controle,
      base_antiga, base_antiga_ultimo_contato, base_antiga_prioridade, base_antiga_canal, base_antiga_gancho, wa_invalido_em
    ) values (
      coalesce(nullif(r.nome, ''), r.primeiro_nome), r.whatsapp_e164, r.email_norm,
      nullif(concat_ws(', ', r.cidade, r.uf), ''),
      coalesce(r.ultimo_contato, now()),
      'Base própria: cadastro anterior no CRM (Sults ' || coalesce(r.sults_ids, '') || '). Contato com opção de sair em toda mensagem.',
      'base_propria', 'base', case when r.canal_inicial = 'whatsapp_email' and r.whatsapp_ok then 'whatsapp' else 'email' end,
      'base_antiga', lower(r.prioridade), v_turma, v_gc,
      true, r.ultimo_contato::date, r.prioridade, r.canal_inicial, r.gancho,
      case when r.whatsapp_ok then null else now() end
    ) returning id into v_lead;

    insert into public.lead_eventos (lead_id, tipo, origem, dados)
      values (v_lead, 'cadastro', 'sistema', jsonb_build_object('base_antiga', true, 'prioridade', r.prioridade, 'canal', r.canal_inicial));
    update public.base_antiga set status = 'lead_criado', lead_id = v_lead, erro = null where id = r.id;
    n_criados := n_criados + 1;

    if v_gc then n_gc := n_gc + 1; continue; end if;

    perform public.fila_enfileirar(v_lead, 'base_antiga_email', v_inicio + make_interval(mins => (n_email / v_lote) * v_int), 'email');
    n_email := n_email + 1;
    if v_wa and r.canal_inicial = 'whatsapp_email' and r.whatsapp_ok then
      perform public.fila_enfileirar(v_lead, 'base_antiga', v_inicio, 'whatsapp');
      n_wa := n_wa + 1;
    end if;
  end loop;
  return query select n_criados, n_vinc, n_email, n_wa, n_gc;
end $$;
revoke all on function public.base_antiga_promover(integer, text[], timestamptz, boolean) from public, anon, authenticated;

-- Gavetas dos Números (docs/17): e-mail da base antiga vira canal próprio, separado por prioridade (p1, p2, p34).
create or replace function public.origem_numeros(p_source text, p_medium text, p_referrer text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_source, '')) = 'instagram' and lower(coalesce(p_medium, '')) = 'stories' then 'stories'
    when lower(coalesce(p_source, '')) = 'instagram' and lower(coalesce(p_medium, '')) in ('bio', '') then 'bio_instagram'
    when lower(coalesce(p_source, '')) = 'tiktok' then 'bio_tiktok'
    when lower(coalesce(p_source, '')) = 'whatsapp' then 'whatsapp'
    when lower(coalesce(p_source, '')) = 'base' and lower(coalesce(p_medium, '')) = 'email' then 'base_email'
    when lower(coalesce(p_source, '')) = 'convite' then 'convite'
    when coalesce(p_source, '') = '' and coalesce(p_medium, '') = '' and coalesce(p_referrer, '') = '' then 'direto'
    else 'outros'
  end
$$;
-- Versão com utm_content, para separar P1, P2 e P3/P4 do e-mail da base antiga.
create or replace function public.origem_numeros(p_source text, p_medium text, p_referrer text, p_content text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_source, '')) = 'base' and lower(coalesce(p_medium, '')) = 'email' then
      case lower(coalesce(p_content, '')) when 'p1' then 'base_p1' when 'p2' then 'base_p2' when 'p3' then 'base_p34' when 'p4' then 'base_p34' when 'p34' then 'base_p34' else 'base_email' end
    else public.origem_numeros(p_source, p_medium, p_referrer)
  end
$$;
