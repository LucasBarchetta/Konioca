-- Endurecimento apontado pelo verificador de segurança do Supabase.
-- 1) Funções: o Postgres concede EXECUTE a PUBLIC por padrão; revogar de anon/authenticated não basta.
--    Fecha tudo, inclusive as funções futuras, e libera só para service_role (functions) e postgres (cron).
-- 2) search_path fixo em todas as funções do schema public.

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public grant execute on functions to service_role;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname <> 'chamar_function'  -- já tem search_path próprio (inclui vault)
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, extensions', f.assinatura);
  end loop;
end $$;

-- chamar_function é security definer e lê o Vault: fica restrita a postgres (dono, usado pelo pg_cron).
revoke execute on function public.chamar_function(text, jsonb) from service_role;
