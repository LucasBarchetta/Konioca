-- Secretária automática da Marcela (pedido do Lucas, 6/10) e smoke completo depois de cada publicação (regra de 6/10).

-- 1) Um registro por envio da secretária: a chave impede repetição (agenda:<segunda>, ics:<turma>:<link>, vespera:<turma>...).
create table if not exists public.secretaria_envios (
  id          bigserial primary key,
  chave       text not null unique,
  tipo        text not null,                      -- agenda | ics | vespera | alerta_zero | dia_2h | dia_15min | pos
  encontro_id bigint references public.encontros(id) on delete set null,
  para        text,                               -- endereços que receberam (internos: Marcela, Lucas)
  detalhe     jsonb not null default '{}'::jsonb,
  enviado_em  timestamptz not null default now()
);
alter table public.secretaria_envios enable row level security;
revoke all on public.secretaria_envios from anon, authenticated;

insert into public.config (chave, valor, publico, descricao) values
  ('secretaria_ativa', 'true', false, 'Secretária automática da Marcela (e-mails de agenda, lembretes e pós-turma). false pausa tudo.'),
  ('secretaria_roteiro', '"[ROTEIRO DE 30 MINUTOS: vazio = usa o resumo do docs/19 que está na function]"', false, 'Roteiro de 30 minutos que vai no lembrete de 2 horas antes. Entre colchetes = usa o padrão da function (resumo de docs/19, com a fala da Circular).')
on conflict (chave) do nothing;

select cron.schedule('secretaria-marcela', '*/5 * * * *', $$ select public.chamar_function('secretaria-marcela') $$);

-- 2) Smoke completo (página, cadastro de teste, planilha, painel, fila), pelo banco, para a sessão dos agentes.
--    smoke_completo() dispara tudo e devolve o id da execução; smoke_resultado(id), 20 a 40 segundos depois, confere as
--    respostas, apaga o cadastro de teste (única exclusão permitida sem pedido: lead marcado monitor_teste com e-mail
--    smoke+...@konioca.test) e devolve ok/falhas. A fila é conferida pelo último fila-processar (cron de 1 minuto).
create table if not exists public.smoke_execucoes (
  id          bigserial primary key,
  iniciado_em timestamptz not null default now(),
  pedidos     jsonb not null default '{}'::jsonb,  -- nome -> id do pedido em net._http_response
  resultado   jsonb,
  concluido_em timestamptz
);
alter table public.smoke_execucoes enable row level security;
revoke all on public.smoke_execucoes from anon, authenticated;

create or replace function public.smoke_completo()
returns jsonb language plpgsql security definer set search_path = public, extensions, vault, net as $$
declare
  v_url text; v_key text; v_lp text; v_exec bigint; v_pedidos jsonb := '{}'::jsonb; v_id bigint;
  v_email text := 'smoke+' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS') || '@konioca.test';
  v_cab jsonb;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then raise exception 'smoke: segredos project_url/service_role_key ausentes no Vault'; end if;
  v_lp := rtrim(coalesce(public.config_text('lp_url'), 'https://prevenda.konioca.com'), '/');
  v_cab := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key);
  insert into public.smoke_execucoes default values returning id into v_exec;
  -- página pública, painel e config pública (só o código HTTP)
  select net.http_get(url := v_lp || '/') into v_id; v_pedidos := v_pedidos || jsonb_build_object('pagina', v_id);
  select net.http_get(url := v_lp || '/painel/') into v_id; v_pedidos := v_pedidos || jsonb_build_object('painel', v_id);
  select net.http_get(url := v_url || '/functions/v1/public-config') into v_id; v_pedidos := v_pedidos || jsonb_build_object('public_config', v_id);
  -- planilha: o CSV inteiro (mesmo caminho do IMPORTDATA)
  select net.http_post(url := v_url || '/functions/v1/leads-planilha', headers := v_cab, body := '{"smoke":true}'::jsonb) into v_id;
  v_pedidos := v_pedidos || jsonb_build_object('planilha', v_id);
  -- cadastro de teste pela mesma function da página (monitor: não dispara Circular, planilha nem pixels)
  select net.http_post(url := v_url || '/functions/v1/lead-intake', headers := v_cab, body := jsonb_build_object(
    'nome', 'Smoke Teste Konioca', 'whatsapp', '+5511987650000', 'email', v_email, 'cidade', 'Teste', 'tem_negocio', false,
    'consentimento', true, 'utm_source', 'teste', 'utm_medium', 'smoke', 'monitor', true)) into v_id;
  v_pedidos := v_pedidos || jsonb_build_object('cadastro', v_id, 'cadastro_email', v_email);
  update public.smoke_execucoes set pedidos = v_pedidos where id = v_exec;
  return jsonb_build_object('execucao', v_exec, 'conferir_em', '20 a 40 segundos', 'conferir', format('select public.smoke_resultado(%s)', v_exec));
end $$;

create or replace function public.smoke_resultado(p_exec bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions, net as $$
declare
  r record; v_p jsonb; v_res jsonb := '{}'::jsonb; v_ok boolean := true; v_email text; v_lead uuid; v_fila timestamptz;
  v_status int; v_content text;
begin
  select pedidos into v_p from public.smoke_execucoes where id = p_exec;
  if v_p is null then raise exception 'smoke: execução % não existe', p_exec; end if;
  for r in select * from jsonb_each_text(v_p) where key <> 'cadastro_email' loop
    select status_code, left(content::text, 300) into v_status, v_content from net._http_response where id = r.value::bigint;
    if v_status is null then v_res := v_res || jsonb_build_object(r.key, 'sem resposta ainda'); v_ok := false;
    elsif r.key = 'planilha' then
      if v_status = 200 and v_content like '{"ok":true,%' then v_res := v_res || jsonb_build_object(r.key, 'ok ' || v_content); else v_res := v_res || jsonb_build_object(r.key, 'FALHA ' || v_status || ' ' || coalesce(v_content, '')); v_ok := false; end if;
    elsif r.key = 'cadastro' then
      if v_status in (200, 201) and v_content like '%"ok":true%' then v_res := v_res || jsonb_build_object(r.key, 'ok'); else v_res := v_res || jsonb_build_object(r.key, 'FALHA ' || v_status || ' ' || coalesce(v_content, '')); v_ok := false; end if;
    else
      if v_status = 200 then v_res := v_res || jsonb_build_object(r.key, 'ok 200'); else v_res := v_res || jsonb_build_object(r.key, 'FALHA ' || v_status); v_ok := false; end if;
    end if;
  end loop;
  -- cadastro de teste gravou no banco? depois, apaga (lead de teste do smoke, sem dado real)
  v_email := v_p ->> 'cadastro_email';
  select id into v_lead from public.leads where email = v_email and monitor_teste;
  if v_lead is null then v_res := v_res || jsonb_build_object('cadastro_no_banco', 'FALHA: lead de teste não gravado ou sem marca monitor_teste'); v_ok := false;
  else
    delete from public.fila_envios where lead_id = v_lead;
    delete from public.lead_eventos where lead_id = v_lead;
    delete from public.mensagens where lead_id = v_lead;
    delete from public.planilha_envios where lead_id = v_lead;
    delete from public.leads where id = v_lead and monitor_teste and email like 'smoke+%@konioca.test';
    v_res := v_res || jsonb_build_object('cadastro_no_banco', 'ok, apagado');
  end if;
  -- fila: o cron de 1 minuto respondeu nos últimos 3 minutos?
  select max(created) into v_fila from net._http_response where content::text like '{"ok":true,"processados"%' and created > now() - interval '3 minutes';
  if v_fila is null then v_res := v_res || jsonb_build_object('fila', 'FALHA: fila-processar sem resposta nos últimos 3 minutos'); v_ok := false;
  else v_res := v_res || jsonb_build_object('fila', 'ok ' || to_char(v_fila at time zone 'America/Sao_Paulo', 'HH24:MI:SS')); end if;
  v_res := v_res || jsonb_build_object('ok', v_ok);
  update public.smoke_execucoes set resultado = v_res, concluido_em = now() where id = p_exec;
  return v_res;
end $$;
revoke all on function public.smoke_completo() from public, anon, authenticated;
revoke all on function public.smoke_resultado(bigint) from public, anon, authenticated;
