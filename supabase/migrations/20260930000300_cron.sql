-- Rotinas agendadas: pg_cron chama as edge functions via pg_net.
-- A URL do projeto e a chave de serviço ficam no Vault (nunca em texto na migration):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service_role_key>', 'service_role_key');
-- Sem esses dois segredos as rotinas não fazem nada (a função abaixo verifica).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.chamar_function(p_nome text, p_body jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then
    raise notice 'chamar_function(%): segredos project_url/service_role_key ausentes no Vault', p_nome;
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/' || p_nome,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := p_body,
    timeout_milliseconds := 30000
  );
end $$;

-- Reconsulta envios da Circular sem confirmação de entrega (webhook perdido), a cada hora.
select cron.schedule('circular-reconciliar', '15 * * * *', $$ select public.chamar_function('circular-reconciliar') $$);

-- Exportação diária para o Sults (modo csv). 06:00 em São Paulo = 09:00 UTC.
select cron.schedule('sults-export-diario', '0 9 * * *', $$ select public.chamar_function('sults-export', '{"modo":"agendado"}') $$);
