-- 1/10 (tarde). Devoluções e spam em qualquer e-mail (docs/16, aprovado pelo Lucas):
--   devolução definitiva bloqueia só o e-mail (endereço entra em emails_bloqueados e o lead fica marcado);
--   spam encerra tudo, igual ao opt-out (e-mail e WhatsApp), com registro no lead;
--   trilha da base antiga pausa sozinha quando as devoluções do dia passam de 3% (mínimo de 20 enviados).
create table if not exists public.emails_bloqueados (
  email        text primary key,                 -- minúsculas
  motivo       text not null,                    -- devolvido | spam | temporaria_repetida
  em           timestamptz not null default now(),
  mensagem_id  bigint,
  dados        jsonb
);
alter table public.leads add column if not exists email_bloqueado_em timestamptz;
alter table public.leads add column if not exists email_bloqueado_motivo text;

insert into public.config (chave, valor, publico, descricao) values
  ('base_antiga_pausada',            'false', false, 'Trilha da base antiga pausada por devoluções. Volta a false só com o sim do Lucas'),
  ('base_antiga_pausada_motivo',     '""',    false, 'Por que e quando a trilha pausou'),
  ('base_antiga_devolucao_minimo',   '20',    false, 'Mínimo de e-mails da base antiga enviados no dia para a taxa de devolução valer'),
  ('base_antiga_devolucao_max_pct',  '3',     false, 'Acima deste percentual de devoluções definitivas no dia, a trilha pausa sozinha e avisa'),
  ('email_devolucao_temporaria_max', '2',     false, 'Devoluções temporárias (caixa cheia etc.) em 7 dias que viram bloqueio do endereço')
on conflict (chave) do update set descricao = excluded.descricao;

create or replace function public.email_bloqueado(p_email text)
returns boolean language sql stable as $$
  select exists (select 1 from public.emails_bloqueados where email = lower(trim(p_email)))
$$;

-- Bloqueia um endereço: lista por endereço + marca nos leads com esse e-mail + cancela itens de e-mail pendentes.
create or replace function public.email_bloquear(p_email text, p_motivo text, p_mensagem_id bigint default null, p_dados jsonb default null)
returns integer language plpgsql as $$
declare
  v_email text := lower(trim(p_email));
  v_n integer := 0;
begin
  if v_email is null or v_email = '' then return 0; end if;
  insert into public.emails_bloqueados (email, motivo, mensagem_id, dados) values (v_email, p_motivo, p_mensagem_id, p_dados)
    on conflict (email) do nothing;
  update public.leads set email_bloqueado_em = now(), email_bloqueado_motivo = p_motivo
    where lower(email) = v_email and email_bloqueado_em is null;
  get diagnostics v_n = row_count;
  update public.fila_envios f set status = 'pulado', motivo = 'email_bloqueado', processado_em = now()
    from public.leads l where l.id = f.lead_id and lower(l.email) = v_email and f.canal = 'email' and f.status in ('pendente', 'processando');
  return v_n;
end $$;

-- Correção humana do e-mail: o lead sai do bloqueio; o endereço antigo continua bloqueado. Evento registrado.
create or replace function public.lead_email_corrigir(p_lead uuid, p_novo text, p_por text default 'time')
returns void language plpgsql as $$
declare
  v_antigo text;
  v_novo text := lower(trim(p_novo));
begin
  select email into v_antigo from public.leads where id = p_lead;
  if v_antigo is null then raise exception 'lead não encontrado: %', p_lead; end if;
  if public.email_bloqueado(v_novo) then raise exception 'o novo endereço também está bloqueado: %', v_novo; end if;
  update public.leads set email = v_novo, email_bloqueado_em = null, email_bloqueado_motivo = null where id = p_lead;
  insert into public.lead_eventos (lead_id, tipo, origem, dados)
    values (p_lead, 'email_corrigido', 'humano', jsonb_build_object('de', v_antigo, 'para', v_novo, 'por', p_por, 'em', now()));
end $$;

-- Devoluções definitivas da base antiga no dia (fuso de São Paulo): enviados, devolvidos e a decisão de pausar.
create or replace function public.base_antiga_devolucoes_dia()
returns table (enviados bigint, devolvidos bigint, pct numeric, pausar boolean) language sql stable as $$
  with dia as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  m as (
    select count(*) as enviados,
           count(*) filter (where status = 'devolvido') as devolvidos
      from public.mensagens, dia
     where canal = 'email' and direcao = 'out' and modelo = 'base_antiga_email'
       and (criado_em at time zone 'America/Sao_Paulo')::date = dia.d
  )
  select enviados, devolvidos,
         case when enviados > 0 then round(devolvidos::numeric * 100 / enviados, 2) else 0 end as pct,
         enviados >= coalesce(public.config_num('base_antiga_devolucao_minimo'), 20)
           and devolvidos::numeric * 100 / greatest(enviados, 1) > coalesce(public.config_num('base_antiga_devolucao_max_pct'), 3) as pausar
    from m
$$;
