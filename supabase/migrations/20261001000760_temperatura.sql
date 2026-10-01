-- Temperatura do lead (regra simples de 1/10, ajustada antes de publicar; o agente de funil refina depois). Calculada na
-- leitura, nunca gravada: muda sozinha a cada atualização do painel e da planilha.
--   Quente: clicou para falar no WhatsApp do time, foi marcado como "respondeu" pelo time, confirmou a Circular,
--           ou clicou num e-mail nosso depois do cadastro (sinal dentro dos últimos 14 dias).
--   Morno:  cadastrou pela página há até 14 dias sem sinal quente (agenda salva não muda nada); ou contato da base
--           antiga que clicou no e-mail.
--   Frio:   base antiga sem clique; cadastro sem nenhuma ação há mais de 14 dias; quem pediu para sair.
-- "Tem negócio" não muda a temperatura: só ordena dentro de cada grupo (no painel e na planilha).
-- "Cadastro" da base antiga é a conversão pela LP (base_antiga_convertido_em), não a promoção do contato.
create or replace function public.lead_temperatura(l public.leads)
returns text language sql stable as $$
  with s as (
    select
      (l.base_antiga is true and l.base_antiga_convertido_em is null and l.utm_campaign = 'base_antiga') as so_base,
      case when (l.base_antiga is true and l.base_antiga_convertido_em is null and l.utm_campaign = 'base_antiga') then null
           else coalesce(l.base_antiga_convertido_em, l.criado_em) end as cadastro_em,
      (select max(e.criado_em) from public.lead_eventos e where e.lead_id = l.id and e.tipo in ('clicou_whatsapp_time', 'respondeu')) as sinal_em,
      (select max(e.criado_em) from public.lead_eventos e where e.lead_id = l.id and e.tipo = 'email_clicado') as email_clicado_em,
      (select max(e.criado_em) from public.lead_eventos e where e.lead_id = l.id and (e.origem = 'lead' or e.tipo = 'respondeu')) as ult_evento_lead
  )
  select case
    when l.optout_em is not null then 'frio'
    when greatest(s.sinal_em, l.circular_confirmada_em, case when not s.so_base then s.email_clicado_em end) >= now() - interval '14 days' then 'quente'
    when s.so_base and s.email_clicado_em is not null then 'morno'
    when s.so_base then 'frio'
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
