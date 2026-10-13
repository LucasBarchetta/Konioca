-- Ritmo de e-mail pelo banco (13/10): o Resend limita a 2 pedidos por segundo e a function manda o lote de uma vez.
-- Hoje 9h10 isso marcou 903 itens do 2º e-mail da base antiga como "falhou" (429). Até a function ganhar o intervalo
-- entre e-mails (PR #29), a fila entrega no máximo config.email_por_minuto e-mails por rodada (1 rodada por minuto;
-- WhatsApp continua com o teto próprio) e um cron devolve à fila, sem gastar tentativa, os itens que falharam por 429.
insert into public.config (chave, valor, publico, descricao) values
  ('email_por_minuto', '3', false, 'Máximo de e-mails que a fila entrega por rodada de 1 minuto (Resend aceita 2 pedidos por segundo).')
on conflict (chave) do nothing;

create or replace function public.fila_proximos(p_limite integer default 20)
returns setof public.fila_envios language plpgsql set search_path = public, pg_temp as $$
declare
  v_email int := coalesce(nullif(public.config_text('email_por_minuto'), '')::int, 3);
begin
  return query
  with cand as (
    select f.id, f.canal, row_number() over (partition by f.canal order by f.prioridade desc, f.agendado_para asc) as rn
      from public.fila_envios f
      join public.leads l on l.id = f.lead_id
     where f.status = 'pendente' and f.agendado_para <= now() and l.optout_em is null
       and (l.reservou_em is null or f.tipo = 'circular_lembrete')
  ), sel as (
    select f.id from public.fila_envios f
     where f.id in (select c.id from cand c where c.canal <> 'email' or c.rn <= v_email)
     order by f.prioridade desc, f.agendado_para asc
     limit p_limite
     for update of f skip locked
  )
  update public.fila_envios f set status = 'processando', tentativas = f.tentativas + 1
    from sel where f.id = sel.id
  returning f.*;
end $$;

-- Itens que falharam por 429 nos últimos 3 dias voltam à fila (até p_max por minuto), sem contar tentativa.
create or replace function public.fila_429_devolver(p_max integer default 10)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer := 0;
begin
  with x as (
    select id from public.fila_envios
     where status = 'falhou' and motivo like 'resend 429%' and coalesce(processado_em, criado_em) > now() - interval '3 days'
     order by id limit p_max for update skip locked
  )
  update public.fila_envios f
     set status = 'pendente', tentativas = greatest(0, f.tentativas - 1), motivo = 'resend 429: devolvido à fila', processado_em = null, agendado_para = now()
    from x where f.id = x.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.fila_429_devolver(integer) from public, anon, authenticated;
select cron.schedule('fila-429-devolver', '* * * * *', $$ select public.fila_429_devolver(10) $$);
