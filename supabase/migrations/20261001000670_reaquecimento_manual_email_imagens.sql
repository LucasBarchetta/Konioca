-- 1/10 (tarde). NÃO aplicar antes do "sim" do Lucas.
-- 1) Lead contatado à mão no WhatsApp: não recebe o convite padrão por WhatsApp (já cancelado pela 660). Quando o
--    WhatsApp oficial ligar, recebe um modelo próprio de reaquecimento (konioca_reaquecimento_manual), só com o nome.
--    Se o modelo não estiver aprovado na Meta, nada sai sozinho para essa pessoa (a fila-processar segura o item
--    enquanto wa_tpl_reaquecimento_manual_aprovado for false). O e-mail de convite segue igual para todos.
insert into public.config (chave, valor, publico, descricao) values
  ('wa_tpl_reaquecimento_manual',          '"konioca_reaquecimento_manual"', false, 'Modelo de WhatsApp para quem foi contatado à mão: {{1}} primeiro nome. Texto fixo aprovado em 1/10'),
  ('wa_tpl_reaquecimento_manual_aprovado', 'false', false, 'Vira true só quando a Meta aprovar o modelo. Com false, o item fica parado na fila e nada sai'),
  ('email_imagens_url', '"https://prevenda.konioca.com/assets/img/email"', false, 'Base das imagens hospedadas dos e-mails (logo e foto da máquina). Servidas pelo Cloudflare Pages, não vão como anexo')
on conflict (chave) do update set descricao = excluded.descricao;

-- Toque fixo do funil: não conta no limite semanal de follow-ups.
update public.config set valor = (valor::jsonb || '["reaquecimento_manual"]'::jsonb)
  where chave = 'msgs_tipos_isentos' and not (valor::jsonb ? 'reaquecimento_manual');

-- 2) Marcar o contato manual: cancela o convite por WhatsApp e enfileira o reaquecimento (um item por lead, dedupe por tipo e canal).
create or replace function public.lead_contato_manual(p_lead uuid, p_por text default 'time')
returns integer language plpgsql as $$
declare
  v_n integer;
  v_lead public.leads%rowtype;
begin
  select * into v_lead from public.leads where id = p_lead;
  if v_lead.id is null then raise exception 'lead não encontrado: %', p_lead; end if;
  update public.leads set contato_manual_em = coalesce(contato_manual_em, now()), contato_manual_por = coalesce(contato_manual_por, p_por) where id = p_lead;
  update public.fila_envios set status = 'cancelado', motivo = 'contato_manual', processado_em = now()
    where lead_id = p_lead and tipo = 'convite' and canal = 'whatsapp' and status in ('pendente', 'processando');
  get diagnostics v_n = row_count;
  if v_lead.optout_em is null and not v_lead.grupo_controle and v_lead.whatsapp is not null and v_lead.wa_invalido_em is null then
    perform public.fila_enfileirar(p_lead, 'reaquecimento_manual', now(), 'whatsapp');
  end if;
  insert into public.lead_eventos (lead_id, tipo, origem, dados) values (p_lead, 'contato_manual', 'humano', jsonb_build_object('por', p_por, 'convites_whatsapp_cancelados', v_n));
  return v_n;
end $$;

-- 3) Quem já foi marcado antes desta migração (Francisco e Eva, em 1/10) entra na mesma regra.
do $$
declare r record;
begin
  for r in select id from public.leads where contato_manual_em is not null and optout_em is null and not grupo_controle and whatsapp is not null and wa_invalido_em is null loop
    perform public.fila_enfileirar(r.id, 'reaquecimento_manual', now(), 'whatsapp');
  end loop;
end $$;
