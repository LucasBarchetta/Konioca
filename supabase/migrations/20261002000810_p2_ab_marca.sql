-- Correção do sorteio A/B (2/10, 9h): base_antiga_promover_ab usava clock_timestamp() como marca e os leads criados
-- por base_antiga_promover nascem com criado_em = now() (início da transação), sempre anterior à marca. Resultado: nenhum
-- lead recebia variante (corrigido à mão com p2_variantes_corrigir). A marca passa a ser now(), igual ao criado_em.
create or replace function public.base_antiga_promover_ab(
  p_limite integer,
  p_prioridades text[] default array['P2'],
  p_inicio timestamptz default now(),
  p_variantes text[] default array['a', 'b']
) returns table (criados integer, vinculados integer, na_fila_email integer, na_fila_whatsapp integer, controle integer, variante_a integer, variante_b integer)
language plpgsql set search_path to 'public', 'extensions' as $$
declare
  v_lote_antes jsonb := (select valor from public.config where chave = 'base_antiga_email_lote');
  v_marca timestamptz := now();
  r record;
  n_a integer := 0; n_b integer := 0;
begin
  update public.config set valor = to_jsonb(greatest(1, p_limite)) where chave = 'base_antiga_email_lote';
  select * into r from public.base_antiga_promover(p_limite, p_prioridades, p_inicio, false);
  update public.config set valor = coalesce(v_lote_antes, to_jsonb(150)) where chave = 'base_antiga_email_lote';
  if p_variantes is not null and array_length(p_variantes, 1) >= 1 then
    with novos as (
      select l.id, row_number() over (order by random()) as rn
        from public.leads l join public.base_antiga b on b.lead_id = l.id
       where l.criado_em >= v_marca and b.status = 'lead_criado' and (p_prioridades is null or b.prioridade = any (p_prioridades))
    )
    update public.leads l set base_antiga_variante = p_variantes[1 + ((n.rn - 1) % array_length(p_variantes, 1))]
      from novos n where n.id = l.id;
    select count(*) filter (where base_antiga_variante = 'a'), count(*) filter (where base_antiga_variante = 'b') into n_a, n_b
      from public.leads where criado_em >= v_marca and base_antiga;
  end if;
  return query select r.criados, r.vinculados, r.na_fila_email, r.na_fila_whatsapp, r.controle, n_a, n_b;
end $$;
revoke execute on function public.base_antiga_promover_ab(integer, text[], timestamptz, text[]) from anon, authenticated;
