-- Segundo e-mail da base antiga (pedido do Lucas, 5/10): só para quem recebeu o primeiro (P1, P2, P3/P4), não se
-- cadastrou pela página e não pediu para sair. Ângulo: as turmas dos encontros estão abertas. Disparo previsto para
-- quarta 7/10 às 9h, só com a aprovação do Lucas ou do LG sobre o teste (decisão de 6/10). Mesmas trilhas de segurança do primeiro: teto de devolução do dia,
-- spam em tolerância zero, pausa pela config base_antiga_pausada.

-- Textos que a function lê (nunca fixos no código). A arte é a versão vencedora do teste do P3/P4: "cones" ou "arte6".
insert into public.config (chave, valor, publico, descricao) values
  ('base_antiga_email2_datas', '"15, 16, 20 e 21 de outubro, às 18h30"', false, 'Segundo e-mail da base antiga: primeiras datas das turmas, em texto, como vai no e-mail'),
  ('base_antiga_email2_arte', '"arte6"', false, 'Segundo e-mail da base antiga: imagem ("cones" = faixa de cones; "arte6" = arte 6 do LG depois do primeiro parágrafo). Decidido pelo resultado do P3/P4 em 6/10: arte 6, 1 cadastro e 2 cliques contra 0 e 0 dos cones')
on conflict (chave) do nothing;

-- O segundo e-mail é toque fixo do funil, fora do limite semanal (como o primeiro).
update public.config set valor = (select jsonb_agg(distinct x) from jsonb_array_elements(valor || '["base_antiga_email2"]'::jsonb) x)
 where chave = 'msgs_tipos_isentos' and not (valor ? 'base_antiga_email2');

-- Gaveta do link do segundo e-mail (utm_content=b2) no painel e na Desempenho.
create or replace function public.origem_numeros(p_source text, p_medium text, p_referrer text, p_content text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_source, '')) = 'base' then
      case lower(coalesce(p_content, ''))
        when 'p1' then 'base_p1' when 'p2' then 'base_p2' when 'p2_a' then 'base_p2_a' when 'p2_b' then 'base_p2_b'
        when 'p3' then 'base_p34' when 'p4' then 'base_p34' when 'p34' then 'base_p34'
        when 'p34_cones' then 'base_p34_cones' when 'p34_arte6' then 'base_p34_arte6'
        when 'b2' then 'base_b2' else 'base_email' end
    else public.origem_numeros(p_source, p_medium, p_referrer)
  end
$$;

-- Teto de devolução do dia conta os dois modelos.
create or replace function public.base_antiga_devolucoes_dia()
returns table (enviados bigint, devolvidos bigint, pct numeric, pausar boolean) language sql stable as $$
  with dia as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  m as (
    select count(*) as enviados,
           count(*) filter (where status = 'devolvido') as devolvidos
      from public.mensagens, dia
     where canal = 'email' and direcao = 'out' and modelo in ('base_antiga_email', 'base_antiga_email2')
       and (criado_em at time zone 'America/Sao_Paulo')::date = dia.d
  )
  select enviados, devolvidos,
         case when enviados > 0 then round(devolvidos::numeric * 100 / enviados, 2) else 0 end as pct,
         enviados >= coalesce(public.config_num('base_antiga_devolucao_minimo'), 20)
           and devolvidos::numeric * 100 / greatest(enviados, 1) > coalesce(public.config_num('base_antiga_devolucao_max_pct'), 3) as pausar
    from m
$$;

-- Enfileira o segundo e-mail. Quem entra: contato importado da base antiga (origem base_propria) cujo primeiro e-mail
-- saiu sem devolução, que não se cadastrou pela página, não saiu, não está com e-mail bloqueado e não é teste. Um item
-- por pessoa. Quem teve devolução no primeiro (inclusive temporária, caixa cheia) fica de fora: pedido do Lucas em 6/10,
-- porque caixa cheia tende a repetir e a repetição derruba o disparo no teto de devolução do dia.
create or replace function public.base_antiga_email2_enfileirar(p_inicio timestamptz default now(), p_prioridades text[] default array['P1','P2','P3','P4'])
returns table (enfileirados integer, por_prioridade jsonb) language plpgsql security definer set search_path = public as $$
declare
  v_n integer := 0; v_p jsonb := '{}'::jsonb; r record;
begin
  for r in
    select l.id, l.base_antiga_prioridade as p
      from public.leads l
     where l.base_antiga and l.origem = 'base_propria' and l.base_antiga_convertido_em is null
       and l.optout_em is null and l.email_bloqueado_em is null and not l.monitor_teste
       and l.base_antiga_prioridade = any (p_prioridades)
       and exists (select 1 from public.mensagens m where m.lead_id = l.id and m.modelo = 'base_antiga_email' and m.status in ('enviado', 'entregue'))
       and not exists (select 1 from public.mensagens m where m.lead_id = l.id and m.modelo = 'base_antiga_email' and m.status = 'devolvido')
       and not exists (select 1 from public.fila_envios f where f.lead_id = l.id and f.tipo = 'base_antiga_email2')
       and not exists (select 1 from public.mensagens m where m.lead_id = l.id and m.modelo = 'base_antiga_email2')
  loop
    perform public.fila_enfileirar(r.id, 'base_antiga_email2', p_inicio, 'email');
    v_n := v_n + 1;
    v_p := v_p || jsonb_build_object(r.p, coalesce((v_p ->> r.p)::integer, 0) + 1);
  end loop;
  return query select v_n, v_p;
end $$;
revoke all on function public.base_antiga_email2_enfileirar(timestamptz, text[]) from public, anon, authenticated;

-- Desempenho: o segundo e-mail aparece como linha própria na tabela de disparos ("2º e-mail", gaveta base_b2).
create or replace function public.desempenho(p_de date default null, p_ate date default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with lim as (select coalesce(p_de, '2000-01-01'::date) as de, coalesce(p_ate, '2100-01-01'::date) as ate),
  v as (
    select origem as canal, sum(novos) as novos, sum(visitas) as visitas
      from public.visitas_dia, lim where pagina = 'lp' and dia between lim.de and lim.ate group by origem
  ), c as (
    select canal, count(*) as cadastros, count(*) filter (where circular) as circulares, count(*) filter (where reservou) as reservas
      from public.desempenho_cadastros(), lim where dia between lim.de and lim.ate group by canal
  ), t as (
    select coalesce(v.canal, c.canal) as canal, coalesce(v.novos, 0) as novos, coalesce(v.visitas, 0) as visitas,
           coalesce(c.cadastros, 0) as cadastros, coalesce(c.circulares, 0) as circulares, coalesce(c.reservas, 0) as reservas
      from v full join c on c.canal = v.canal
  ),
  m as (
    select (m.criado_em at time zone 'America/Sao_Paulo')::date as dia,
           case when m.modelo = 'base_antiga_email2' then 'base_b2' else public.gaveta_disparo(l.base_antiga_prioridade, l.base_antiga_variante) end as canal,
           case when m.modelo = 'base_antiga_email2' then '2º e-mail' else l.base_antiga_prioridade end as prioridade,
           case when m.modelo = 'base_antiga_email2' then null else l.base_antiga_variante end as variante,
           count(*) as enviados,
           count(*) filter (where m.status = 'entregue') as entregues,
           count(*) filter (where m.status = 'devolvido') as devolvidos,
           count(*) filter (where l.optout_motivo = 'spam') as spam
      from public.mensagens m join public.leads l on l.id = m.lead_id, lim
     where m.canal = 'email' and m.direcao = 'out' and m.modelo in ('base_antiga_email', 'base_antiga_email2') and m.tipo <> 'teste'
       and (m.criado_em at time zone 'America/Sao_Paulo')::date between lim.de and lim.ate
     group by 1, 2, 3, 4
  ), d as (
    select jsonb_build_object(
             'dia', m.dia, 'canal', m.canal, 'prioridade', m.prioridade, 'variante', m.variante,
             'enviados', m.enviados, 'entregues', m.entregues, 'devolvidos', m.devolvidos, 'spam', m.spam,
             'cliques', coalesce((select sum(v.visitas) from public.visitas_dia v where v.pagina = 'lp' and v.origem_visita = m.canal and v.dia >= m.dia), 0),
             'cadastros', (select count(*) from public.desempenho_cadastros() c where c.canal = m.canal and c.dia >= m.dia)
           ) as j, m.dia, m.prioridade, m.variante
      from m
  )
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate, 'gerado_em', now(),
    'resumo', (select jsonb_build_object('novos', coalesce(sum(novos), 0), 'visitas', coalesce(sum(visitas), 0), 'cadastros', coalesce(sum(cadastros), 0),
                                         'circulares', coalesce(sum(circulares), 0), 'reservas', coalesce(sum(reservas), 0)) from t)
              || jsonb_build_object('placar', (select jsonb_build_object('reservas_lote1', p.reservas_lote1, 'reservas_total', p.reservas_total) from public.v_placar p)),
    'canais', (select coalesce(jsonb_agg(jsonb_build_object('canal', canal, 'novos', novos, 'visitas', visitas, 'cadastros', cadastros, 'circulares', circulares, 'reservas', reservas)
                                         order by cadastros desc, novos desc, canal), '[]'::jsonb) from t),
    'disparos', (select coalesce(jsonb_agg(j order by dia desc, prioridade, variante), '[]'::jsonb) from d),
    'cliques_sem_gaveta', (select coalesce(sum(v.visitas), 0) from public.visitas_dia v, lim where v.pagina = 'lp' and v.origem_visita = 'base_email' and v.dia between lim.de and lim.ate)
  )
$$;
