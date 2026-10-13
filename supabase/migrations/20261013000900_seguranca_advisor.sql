-- Segurança (pedido do Lucas, 13/10): fechar o que o Advisor de segurança do Supabase apontou para as chaves
-- anon/authenticated. Idempotente: parte já tinha sido aplicada direto no banco pela sessão dos agentes.
-- Princípio do projeto: a chave pública não lê tabela, view nem função nenhuma. A landing page e o painel falam só com
-- as Edge Functions (chave de serviço por dentro). Qualquer exceção futura recebe GRANT explícito aqui, com o porquê.

-- 1) emails_bloqueados: RLS ativo e sem policy (só service_role, que passa por cima do RLS).
alter table public.emails_bloqueados enable row level security;
revoke all on public.emails_bloqueados from anon, authenticated;

-- 2) Views: nada para anon/authenticated e security_invoker (a view roda com as permissões de quem consulta,
--    não do dono; o service_role continua enxergando tudo).
do $$
declare v text;
begin
  foreach v in array array['v_painel_leads', 'v_leads_planilha', 'v_lead_cobranca', 'v_encontros'] loop
    if exists (select 1 from pg_views where schemaname = 'public' and viewname = v) then
      execute format('revoke all on public.%I from anon, authenticated', v);
      execute format('alter view public.%I set (security_invoker = true)', v);
    end if;
  end loop;
end $$;

-- 3) Funções de manutenção da base antiga: sem execute para public/anon/authenticated (qualquer assinatura).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('base_antiga_corrigir_dominios', 'base_antiga_corrigir_dominios_v2', 'p2_variante_unica')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.f);
  end loop;
end $$;

-- 4) search_path fixo em toda função do schema public que ainda não tem (alerta function_search_path_mutable).
--    Nenhuma delas usa objeto de extensão sem o schema (conferido nas migrações), por isso public, pg_temp basta.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f', 'p')
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.f);
  end loop;
end $$;

-- 5) Causa raiz: privilégios padrão. Objeto novo criado por postgres (migrações) nasce sem nada para anon/authenticated.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
-- E o que já existe, de novo (idempotente).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
-- GRANTs explícitos para a chave pública: nenhum hoje. A landing page usa só as Edge Functions
-- (lead-intake, public-config, visita, encontro-escolher, optout, circular-confirmar), todas com a chave de serviço por dentro.
