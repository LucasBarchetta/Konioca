-- Teste do P3/P4 de 5/10 (pedido do Lucas em 2/10 à noite): metade com a faixa de cones (atual), metade com a arte 6 do
-- LG depois do primeiro parágrafo, sorteadas por base_antiga_promover_ab (a = cones, b = arte 6), cada uma com o seu
-- utm_content (p34_cones / p34_arte6). Painel e Desempenho separam as duas gavetas; o resto da regra não muda.
create or replace function public.origem_numeros(p_source text, p_medium text, p_referrer text, p_content text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_source, '')) = 'base' and lower(coalesce(p_medium, '')) = 'email' then
      case lower(coalesce(p_content, ''))
        when 'p1' then 'base_p1' when 'p2' then 'base_p2' when 'p2_a' then 'base_p2_a' when 'p2_b' then 'base_p2_b'
        when 'p3' then 'base_p34' when 'p4' then 'base_p34' when 'p34' then 'base_p34'
        when 'p34_cones' then 'base_p34_cones' when 'p34_arte6' then 'base_p34_arte6' else 'base_email' end
    else public.origem_numeros(p_source, p_medium, p_referrer)
  end
$$;
comment on column public.leads.base_antiga_variante is 'Teste A/B do e-mail da base antiga. P2 (2/10): a = texto aprovado, b = versão de impacto (p2_a / p2_b). P3/P4 (5/10): a = faixa de cones, b = arte 6 do LG (p34_cones / p34_arte6).';
