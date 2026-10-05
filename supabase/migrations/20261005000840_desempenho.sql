-- Aba "Desempenho" do painel, parte 1 (docs/17): resumo, tabela por canal e disparos de e-mail, por período.
-- Só leitura. Nada aqui envia mensagem nem altera lead ou fila.
--
-- Correção de 5/10 (pedido do Lucas): "cadastro" é só quem se cadastrou pela página. Contato da base antiga importado
-- não é cadastro; vira cadastro quando entra pela página (base_antiga_convertido_em). Leads de teste e do Monitor
-- ficam de fora. Os 45 contatos P1 importados em 1/10 com utm_medium=whatsapp caíam em "Outros": a gaveta da base
-- antiga passa a valer para utm_source=base com qualquer medium.

create or replace function public.origem_numeros(p_source text, p_medium text, p_referrer text, p_content text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_source, '')) = 'base' then
      case lower(coalesce(p_content, ''))
        when 'p1' then 'base_p1' when 'p2' then 'base_p2' when 'p2_a' then 'base_p2_a' when 'p2_b' then 'base_p2_b'
        when 'p3' then 'base_p34' when 'p4' then 'base_p34' when 'p34' then 'base_p34'
        when 'p34_cones' then 'base_p34_cones' when 'p34_arte6' then 'base_p34_arte6' else 'base_email' end
    else public.origem_numeros(p_source, p_medium, p_referrer)
  end
$$;

-- Gaveta de um disparo da base antiga (prioridade + variante), a mesma dos links dos e-mails (utm_content).
create or replace function public.gaveta_disparo(p_prioridade text, p_variante text)
returns text language sql immutable as $$
  select case
    when p_prioridade = 'P1' then 'base_p1'
    when p_prioridade = 'P2' then case p_variante when 'a' then 'base_p2_a' when 'b' then 'base_p2_b' else 'base_p2' end
    when p_prioridade in ('P3', 'P4') then case p_variante when 'a' then 'base_p34_cones' when 'b' then 'base_p34_arte6' else 'base_p34' end
    else 'base_email'
  end
$$;

-- Cadastros pela página, um por linha, sem dado pessoal: dia (SP), gaveta do primeiro toque, Circular confirmada,
-- reservou (marcação da Fase A no painel). Quem não veio da base antiga, ou veio e se cadastrou pela página.
create or replace function public.desempenho_cadastros()
returns table (lead_id uuid, dia date, canal text, circular boolean, reservou boolean, spam boolean)
language sql stable security definer set search_path = public as $$
  select l.id, (coalesce(l.base_antiga_convertido_em, l.criado_em) at time zone 'America/Sao_Paulo')::date,
         public.origem_numeros(l.utm_source, l.utm_medium, l.referrer, l.utm_content),
         l.circular_confirmada_em is not null, l.reservou_em is not null, l.optout_motivo = 'spam'
    from public.leads l
   where not l.monitor_teste
     and (not l.base_antiga or l.base_antiga_convertido_em is not null)
     and lower(coalesce(l.utm_source, '')) not in ('teste', 'monitor')
$$;

-- Os blocos da aba, calculados no banco. p_de e p_ate em dia de São Paulo (null = sem limite).
-- Parte 1 devolve resumo, canais e disparos; funil, por_dia e links entram na parte 2.
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
  -- Disparos de e-mail da base antiga, um por dia e gaveta (prioridade + variante). Só envios reais (com lead).
  -- Spam = quem saiu por marcação de spam (o provedor avisa pelo webhook). Clique = visita à LP vinda do link daquela
  -- gaveta (origem_visita), do dia do disparo em diante; o rastreio de clique do provedor fica desligado.
  -- Cadastro = quem entrou pela página com o link daquela gaveta, do dia do disparo em diante.
  m as (
    select (m.criado_em at time zone 'America/Sao_Paulo')::date as dia,
           public.gaveta_disparo(l.base_antiga_prioridade, l.base_antiga_variante) as canal,
           l.base_antiga_prioridade as prioridade, l.base_antiga_variante as variante,
           count(*) as enviados,
           count(*) filter (where m.status = 'entregue') as entregues,
           count(*) filter (where m.status = 'devolvido') as devolvidos,
           count(*) filter (where l.optout_motivo = 'spam') as spam
      from public.mensagens m join public.leads l on l.id = m.lead_id, lim
     where m.canal = 'email' and m.direcao = 'out' and m.modelo = 'base_antiga_email' and m.tipo <> 'teste'
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
    -- Cliques da base antiga que chegaram sem gaveta (contador sem utm_content até 5/10): mostrados à parte.
    'cliques_sem_gaveta', (select coalesce(sum(v.visitas), 0) from public.visitas_dia v, lim where v.pagina = 'lp' and v.origem_visita = 'base_email' and v.dia between lim.de and lim.ate)
  )
$$;
revoke all on function public.desempenho(date, date) from public, anon, authenticated;
revoke all on function public.desempenho_cadastros() from public, anon, authenticated;
revoke all on function public.gaveta_disparo(text, text) from public, anon, authenticated;
