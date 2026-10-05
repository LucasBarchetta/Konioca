-- Pedido do Lucas (5/10): na lista de leads do painel e na planilha, contato da base antiga mostra a data em que se
-- cadastrou pela página (base_antiga_convertido_em), não a da importação. Contato importado que ainda não se cadastrou
-- não aparece como lead em nenhuma das duas. Quem já era lead pela página antes da importação (a promoção só vincula,
-- origem diferente de base_propria) continua aparecendo com a data real do cadastro. Só exibição: nada muda na fila,
-- nos envios nem na contagem da Desempenho.

create or replace view public.v_painel_leads as
select l.id, l.nome, l.whatsapp, l.email, l.cidade, l.origem, l.tem_negocio,
       coalesce(l.base_antiga_convertido_em, l.criado_em) as criado_em, l.status_funil, l.faixa,
       l.base_antiga, l.grupo_controle, l.optout_em, l.optout_motivo,
       l.convidado_em, l.contato_manual_em, l.contato_manual_por,
       l.circular_enviada_em, l.circular_confirmada_em, c.liberado_em, c.pode_cobrar, c.dias_faltam,
       l.reservou_em, l.reservou_por,
       (select count(*)::integer from public.reservas r where r.lead_id = l.id and r.status in ('reservada','paga')) as reservas_qtd,
       l.email_bloqueado_em, l.email_bloqueado_motivo, l.wa_invalido_em,
       l.pergunta_live, l.intencao,
       greatest(l.atualizado_em, coalesce(l.ultima_msg_lead_em, l.criado_em)) as atividade_em,
       public.origem_numeros(l.utm_source, l.utm_medium, l.referrer, l.utm_content) as canal,
       l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content,
       public.lead_temperatura(l) as temperatura,
       (select max(e.criado_em) from public.lead_eventos e where e.lead_id = l.id and e.tipo = 'respondeu') as respondeu_em,
       l.encontro_id, en.inicio as encontro_inicio, l.encontro_presenca, l.encontro_escolhido_em
  from public.leads l
  join public.v_lead_cobranca c on c.lead_id = l.id
  left join public.encontros en on en.id = l.encontro_id
 where not l.monitor_teste
   and not (l.base_antiga and l.base_antiga_convertido_em is null and l.origem = 'base_propria');

create or replace view public.v_leads_planilha as
select l.id, coalesce(l.base_antiga_convertido_em, l.criado_em) as criado_em, l.nome, l.whatsapp, l.email, l.cidade, l.tem_negocio, l.origem,
       l.utm_source, l.utm_medium, l.bloqueado_em,
       public.lead_temperatura(l) as temperatura
  from public.leads l
 where l.optout_em is null and l.anonimizado_em is null and not l.monitor_teste
   and not (l.base_antiga and l.base_antiga_convertido_em is null and l.origem = 'base_propria');
