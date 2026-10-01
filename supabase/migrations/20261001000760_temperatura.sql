-- Temperatura do lead (regra simples de 1/10; o agente de funil refina depois). Calculada na leitura, nunca gravada:
-- muda sozinha a cada atualização do painel e da planilha.
--   Quente: nos últimos 7 dias clicou para falar no WhatsApp do time, salvou a live na agenda, confirmou a Circular
--           ou foi marcado como "respondeu" pelo time; ou tem negócio e se cadastrou nos últimos 3 dias.
--   Morno:  cadastrou pela página ou clicou no e-mail, sem sinal quente nos últimos 7 dias.
--   Frio:   base antiga sem nenhum clique; cadastro sem interação há mais de 14 dias; quem pediu para sair.
-- "Cadastro" da base antiga é a conversão pela LP (base_antiga_convertido_em), não a promoção do contato.
create or replace function public.lead_temperatura(l public.leads)
returns text language sql stable as $$
  with s as (
    select
      (l.base_antiga is true and l.base_antiga_convertido_em is null and l.utm_campaign = 'base_antiga') as so_base,
      case when (l.base_antiga is true and l.base_antiga_convertido_em is null and l.utm_campaign = 'base_antiga') then null
           else coalesce(l.base_antiga_convertido_em, l.criado_em) end as cadastro_em,
      (select max(e.criado_em) from public.lead_eventos e where e.lead_id = l.id and e.tipo in ('clicou_whatsapp_time', 'clicou_agenda', 'respondeu')) as sinal_quente_em,
      (select max(e.criado_em) from public.lead_eventos e where e.lead_id = l.id and (e.origem = 'lead' or e.tipo = 'respondeu')) as ult_evento_lead
  )
  select case
    when l.optout_em is not null then 'frio'
    when greatest(s.sinal_quente_em, l.circular_confirmada_em) >= now() - interval '7 days' then 'quente'
    when l.tem_negocio is true and s.cadastro_em >= now() - interval '3 days' then 'quente'
    when s.so_base and s.ult_evento_lead is null and l.ultima_msg_lead_em is null then 'frio'
    when greatest(s.cadastro_em, s.ult_evento_lead, l.ultima_msg_lead_em, l.circular_confirmada_em) < now() - interval '14 days' then 'frio'
    else 'morno' end
  from s
$$;

-- Painel: temperatura e a última marcação "respondeu" (botão do time) por lead.
create or replace view public.v_painel_leads as
select l.id, l.nome, l.whatsapp, l.email, l.cidade, l.origem, l.tem_negocio, l.criado_em, l.status_funil, l.faixa,
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
       (select max(e.criado_em) from public.lead_eventos e where e.lead_id = l.id and e.tipo = 'respondeu') as respondeu_em
  from public.leads l
  join public.v_lead_cobranca c on c.lead_id = l.id
 where not l.monitor_teste;

-- Planilha do time (aba Total): só cadastros pela página (decisão de 1/10), sem quem saiu, com temperatura.
create or replace view public.v_leads_planilha as
select l.id, l.criado_em, l.nome, l.whatsapp, l.email, l.cidade, l.tem_negocio, l.origem, l.utm_source, l.utm_medium, l.bloqueado_em,
       public.lead_temperatura(l) as temperatura
  from public.leads l
 where l.optout_em is null and l.anonimizado_em is null and not l.monitor_teste
   and not (l.base_antiga is true and l.base_antiga_convertido_em is null and l.utm_campaign = 'base_antiga');
