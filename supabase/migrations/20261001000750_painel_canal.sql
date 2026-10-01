-- Painel (pedido de 1/10): etiqueta de canal ao lado do nome de cada lead, com a mesma regra de primeiro toque da
-- aba Desempenho (origem_numeros sobre os UTMs guardados no cadastro), e o utm_content para mostrar o link específico
-- (ex.: roteiro de vídeo) ao tocar na etiqueta. Só leitura: a view ganha colunas no fim; nada muda no fluxo.
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
       l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content
  from public.leads l
  join public.v_lead_cobranca c on c.lead_id = l.id
 where not l.monitor_teste;
