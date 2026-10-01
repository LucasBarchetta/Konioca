-- 1/10 (noite). Ajuste do Lucas: "Reservou" só para lead com "pode cobrar" (Circular confirmada há pelo menos
-- circular_prazo_dias). A regra vale no banco: a função recusa; a tela só espelha.
create or replace function public.lead_reservar(p_lead uuid, p_quantidade integer, p_por text, p_observacao text default null)
returns table (reservas_lead integer, reservas_lote1 integer, lote1_tamanho integer) language plpgsql as $$
declare
  v_lead public.leads%rowtype;
  v_cob record;
  v_lote smallint := 1;
  v_proximo integer;
  v_valor numeric := coalesce(public.config_num('preco_prevenda'), 0);
  v_n integer;
  i integer;
begin
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 10 then raise exception 'quantidade fora de 1 a 10: %', p_quantidade; end if;
  if p_por is null or trim(p_por) = '' then raise exception 'informe quem está marcando'; end if;
  select * into v_lead from public.leads where id = p_lead;
  if v_lead.id is null then raise exception 'lead não encontrado: %', p_lead; end if;
  if v_lead.optout_em is not null then raise exception 'lead saiu da pré-venda'; end if;
  select * into v_cob from public.v_lead_cobranca where lead_id = p_lead;
  if v_cob.confirmada_em is null then raise exception 'Circular não confirmada: a reserva só pode ser marcada depois do prazo legal'; end if;
  if not v_cob.pode_cobrar then raise exception 'prazo legal da Circular ainda não terminou: faltam % dia(s)', v_cob.dias_faltam; end if;
  insert into public.lotes (id, nome, tamanho) values (1, 'Lote 1', coalesce(public.config_num('lote1_tamanho'), 250)::integer) on conflict (id) do nothing;
  for i in 1..p_quantidade loop
    select coalesce(max(numero), 0) + 1 into v_proximo from public.reservas where lote_id = v_lote;
    insert into public.reservas (lead_id, lote_id, numero, valor, status, reservado_em, reservado_por, observacao)
      values (p_lead, v_lote, v_proximo, v_valor, 'reservada', now(), p_por, p_observacao);
  end loop;
  update public.leads set reservou_em = coalesce(reservou_em, now()), reservou_por = coalesce(reservou_por, p_por), status_funil = 'reservado' where id = p_lead;
  update public.fila_envios set status = 'cancelado', motivo = 'reservou', processado_em = now()
    where lead_id = p_lead and status in ('pendente', 'processando') and tipo <> 'circular_lembrete';
  get diagnostics v_n = row_count;
  insert into public.lead_eventos (lead_id, tipo, origem, dados)
    values (p_lead, 'reservou', 'humano', jsonb_build_object('quantidade', p_quantidade, 'por', p_por, 'observacao', p_observacao, 'itens_cancelados', v_n, 'em', now()));
  return query select
    (select count(*)::integer from public.reservas r where r.lead_id = p_lead and r.status in ('reservada','paga')),
    public.reservas_confirmadas(1::smallint),
    coalesce(public.config_num('lote1_tamanho'), 250)::integer;
end $$;
