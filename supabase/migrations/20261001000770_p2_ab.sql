-- Teste A/B do P2 (pedido do Lucas em 1/10 à noite, substitui o disparo único de 2/10):
--   9h: 350 pessoas sorteadas, 175 com a versão A (texto aprovado) e 175 com a B (assunto e abertura pelo preço);
--   15h: as outras 353 recebem a versão que trouxe mais cadastros pela página (empate: mais cliques; zero a zero: espera segunda).
-- A variante fica no lead (base_antiga_variante) e vai no link (utm_content p2_a / p2_b), que o painel e a Desempenho separam.
alter table public.leads add column if not exists base_antiga_variante text check (base_antiga_variante in ('a', 'b'));
comment on column public.leads.base_antiga_variante is 'Teste A/B do e-mail da base antiga (P2, 2/10): a = texto aprovado, b = versão de impacto. Vai no utm_content (p2_a / p2_b).';

-- Gaveta dos Números: p2_a e p2_b continuam na gaveta base_p2 (o detalhe fica no utm_content).
create or replace function public.origem_numeros(p_source text, p_medium text, p_referrer text, p_content text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_source, '')) = 'base' and lower(coalesce(p_medium, '')) = 'email' then
      case split_part(lower(coalesce(p_content, '')), '_', 1) when 'p1' then 'base_p1' when 'p2' then 'base_p2' when 'p3' then 'base_p34' when 'p4' then 'base_p34' when 'p34' then 'base_p34' else 'base_email' end
    else public.origem_numeros(p_source, p_medium, p_referrer)
  end
$$;

-- Promove um lote da base antiga de uma vez (sem escalonar por hora) e sorteia metade A, metade B entre os leads criados.
-- Usa base_antiga_promover por dentro: o tamanho do lote de e-mail é trocado só durante esta transação e volta ao valor da config.
create or replace function public.base_antiga_promover_ab(
  p_limite integer,                       -- quantas pessoas neste lote (ex.: 350)
  p_prioridades text[] default array['P2'],
  p_inicio timestamptz default now(),     -- hora do envio de todo o lote
  p_variantes text[] default array['a', 'b'] -- null ou lista de 1 = sem sorteio (todo mundo com a mesma versão)
) returns table (criados integer, vinculados integer, na_fila_email integer, na_fila_whatsapp integer, controle integer, variante_a integer, variante_b integer)
language plpgsql set search_path to 'public', 'extensions' as $$
declare
  v_lote_antes jsonb := (select valor from public.config where chave = 'base_antiga_email_lote');
  v_marca timestamptz := clock_timestamp();
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
