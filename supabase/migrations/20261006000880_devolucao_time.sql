-- Devolução definitiva de endereço do próprio time (Lucas, 6/10, depois da caixa controladoria@ ficar fora do ar na
-- noite de 5/10 e ser bloqueada às 9h20): não bloqueia de imediato. A primeira devolução só registra aqui e avisa o
-- Lucas; 6 horas depois (config.email_devolucao_time_horas) o cron manda um teste de entrega curto para o endereço;
-- se voltar outra vez (qualquer devolução definitiva depois da janela), aí bloqueia e avisa. Uma entrega qualquer no
-- endereço encerra a queda (resolvido_em). "Time" = endereços de config.painel_aprovadores (principal e cópias) e os
-- domínios em config.email_time_dominios.
create table if not exists public.email_devolucoes_time (
  id           bigserial primary key,
  email        text not null,                    -- minúsculas
  em           timestamptz not null default now(),
  motivo       text,
  provedor_id  text,                             -- id do e-mail no Resend
  mensagem_id  bigint,
  decisao      text not null,                    -- primeira | mesma_queda | bloqueou
  retentado_em timestamptz,                      -- quando o teste de entrega saiu
  resolvido_em timestamptz                       -- entrega depois da devolução (caixa voltou) ou bloqueio
);
create index if not exists email_devolucoes_time_email_idx on public.email_devolucoes_time (email, em);
alter table public.email_devolucoes_time enable row level security;
revoke all on public.email_devolucoes_time from anon, authenticated;

insert into public.config (chave, valor, publico, descricao) values
  ('email_time_dominios',        '["konioca.com"]', false, 'Domínios do próprio time: devolução definitiva não bloqueia de imediato (regra de 6/10). Aprovadores do painel entram sempre.'),
  ('email_devolucao_time_horas', '6',               false, 'Horas depois da primeira devolução de um endereço do time para tentar de novo; só bloqueia se voltar outra vez depois disso.')
on conflict (chave) do nothing;

-- Cron: 6 horas depois da primeira devolução aberta, um teste de entrega curto (via email-teste, tipo texto, só para
-- endereço de painel_aprovadores). A entrega ou a nova devolução chega pelo webhook e decide.
create or replace function public.email_time_retentar()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r record; v_horas int := coalesce(nullif(public.config_text('email_devolucao_time_horas'), '')::int, 6); v_n int := 0;
begin
  for r in
    select email, min(em) as primeira
      from public.email_devolucoes_time
     where resolvido_em is null and retentado_em is null
     group by email
    having min(em) < now() - make_interval(hours => v_horas)
  loop
    if exists (select 1 from public.emails_bloqueados b where b.email = r.email) then
      update public.email_devolucoes_time set resolvido_em = now() where email = r.email and resolvido_em is null;
      continue;
    end if;
    perform public.chamar_function('email-teste', jsonb_build_object(
      'tipo', 'texto', 'para', r.email,
      'assunto', 'Teste de entrega automático (pode ignorar)',
      'texto', format(E'Este endereço devolveu um e-mail do Painel Konioca em %s. Este é o teste automático de entrega, %s horas depois. Se chegou, está tudo certo e nada muda. Se voltar de novo, o endereço é bloqueado e o Lucas é avisado.\n\nPainel Konioca',
        to_char(r.primeira at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24"h"MI'), v_horas)));
    update public.email_devolucoes_time set retentado_em = now() where email = r.email and resolvido_em is null;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'testes', v_n);
end $$;
revoke all on function public.email_time_retentar() from public, anon, authenticated;
select cron.schedule('email-time-retentar', '*/30 * * * *', $$ select public.email_time_retentar() $$);
