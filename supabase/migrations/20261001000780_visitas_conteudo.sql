-- Contador de visitas com utm_content (1/10 à noite): até aqui a function visita não passava o utm_content, e os cliques
-- dos e-mails da base antiga caíam todos em "base_email" (o clique do P1 de 1/10 está lá). Agora o primeiro toque e o
-- link da visita levam o content: P1/P2/P3-P4 separados, e o teste A/B do P2 separa p2_a e p2_b (gavetas base_p2_a e base_p2_b).
create or replace function public.origem_numeros(p_source text, p_medium text, p_referrer text, p_content text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_source, '')) = 'base' and lower(coalesce(p_medium, '')) = 'email' then
      case lower(coalesce(p_content, ''))
        when 'p1' then 'base_p1' when 'p2' then 'base_p2' when 'p2_a' then 'base_p2_a' when 'p2_b' then 'base_p2_b'
        when 'p3' then 'base_p34' when 'p4' then 'base_p34' when 'p34' then 'base_p34' else 'base_email' end
    else public.origem_numeros(p_source, p_medium, p_referrer)
  end
$$;

create or replace function public.visita_registrar(
  p_pagina text,
  p_src text, p_med text, p_ref text, p_content text,            -- primeiro toque (k_rastreio)
  p_src_v text, p_med_v text, p_ref_v text, p_content_v text,    -- link desta visita
  p_nova boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_pagina text := case when p_pagina in ('lp', 'obrigado') then p_pagina else 'lp' end;
begin
  insert into public.visitas_dia (dia, pagina, origem, origem_visita, visitas, novos)
  values (v_dia, v_pagina, origem_numeros(p_src, p_med, p_ref, p_content), origem_numeros(p_src_v, p_med_v, p_ref_v, p_content_v), 1, case when p_nova then 1 else 0 end)
  on conflict (dia, pagina, origem, origem_visita) do update
    set visitas = visitas_dia.visitas + 1,
        novos = visitas_dia.novos + (case when p_nova then 1 else 0 end);
end $$;
revoke all on function public.visita_registrar(text, text, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
