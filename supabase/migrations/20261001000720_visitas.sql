-- Aba "Números" (docs/17), parte 1: contador de visitas da LP. Decisões do Lucas em 1/10: taxa sobre visitantes novos,
-- origem pelo primeiro toque como padrão (link desta visita numa coluna à parte), gaveta "Outros" visível.
-- Nada por pessoa: só contadores por dia (America/Sao_Paulo), página e origem. Sem cookie, sem IP, sem user agent.
-- Por isso nada muda em retenção e anonimização (docs/10).

create table if not exists public.visitas_dia (
  dia            date not null,
  pagina         text not null,                 -- lp | obrigado
  origem         text not null,                 -- gaveta do primeiro toque (o que o cadastro também usa)
  origem_visita  text not null,                 -- gaveta do link desta visita ("qual story trouxe gente hoje")
  visitas        integer not null default 0,    -- carregamentos da página
  novos          integer not null default 0,    -- primeira vez naquele navegador (marca k_visitou, sem identificação)
  primary key (dia, pagina, origem, origem_visita)
);
alter table public.visitas_dia enable row level security; -- sem políticas: só a chave de serviço lê e escreve

-- Uma regra só para visita e cadastro. Gavetas: stories | bio_instagram | bio_tiktok | whatsapp | direto | outros.
-- Casa com os links de docs/08. Tudo em minúsculas; medium vazio no Instagram conta como bio (link da bio sem UTM de medium).
create or replace function public.origem_numeros(p_source text, p_medium text, p_referrer text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_source, '')) = 'instagram' and lower(coalesce(p_medium, '')) = 'stories' then 'stories'
    when lower(coalesce(p_source, '')) = 'instagram' and lower(coalesce(p_medium, '')) in ('bio', '') then 'bio_instagram'
    when lower(coalesce(p_source, '')) = 'tiktok' then 'bio_tiktok'
    when lower(coalesce(p_source, '')) = 'whatsapp' then 'whatsapp'
    when coalesce(p_source, '') = '' and coalesce(p_medium, '') = '' and coalesce(p_referrer, '') = '' then 'direto'
    else 'outros'
  end
$$;

-- Soma uma visita (e um "novo", se for a primeira vez naquele navegador). Chamada só pela function visita (chave de serviço).
create or replace function public.visita_registrar(
  p_pagina text,
  p_src text, p_med text, p_ref text,          -- primeiro toque (k_rastreio)
  p_src_v text, p_med_v text, p_ref_v text,    -- link desta visita
  p_nova boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_pagina text := case when p_pagina in ('lp', 'obrigado') then p_pagina else 'lp' end;
begin
  insert into public.visitas_dia (dia, pagina, origem, origem_visita, visitas, novos)
  values (v_dia, v_pagina, origem_numeros(p_src, p_med, p_ref), origem_numeros(p_src_v, p_med_v, p_ref_v), 1, case when p_nova then 1 else 0 end)
  on conflict (dia, pagina, origem, origem_visita) do update
    set visitas = visitas_dia.visitas + 1,
        novos = visitas_dia.novos + (case when p_nova then 1 else 0 end);
end $$;
revoke all on function public.visita_registrar(text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
