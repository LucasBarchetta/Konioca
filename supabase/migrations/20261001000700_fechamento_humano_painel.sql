-- 1/10. Fechamento com o time humano e painel da Fase A (docs/14, aprovado pelo Lucas em 1/10).
-- 1) Reservas marcadas pelo time ("reservou", com quantidade). Uma linha por máquina, numerada dentro do lote 1,
--    para o placar das 250 continuar valendo ("037 de 250"). Pagamento, PIX e contrato ficam fora do sistema.
alter table public.reservas add column if not exists reservado_em timestamptz;
alter table public.reservas add column if not exists reservado_por text;
alter table public.reservas add column if not exists observacao text;
alter table public.reservas add column if not exists cancelada_em timestamptz;
alter table public.reservas add column if not exists cancelada_por text;
alter table public.leads add column if not exists reservou_em timestamptz;
alter table public.leads add column if not exists reservou_por text;

-- O placar conta reservas feitas pelo time ("reservada") e as pagas.
create or replace function public.reservas_confirmadas(p_lote smallint default null)
returns integer language sql stable as $$
  select count(*)::integer from public.reservas
  where status in ('reservada', 'paga') and (p_lote is null or lote_id = p_lote)
$$;

create or replace function public.lead_reservar(p_lead uuid, p_quantidade integer, p_por text, p_observacao text default null)
returns table (reservas_lead integer, reservas_lote1 integer, lote1_tamanho integer) language plpgsql as $$
declare
  v_lead public.leads%rowtype;
  v_lote smallint := 1;
  v_proximo integer;
  v_valor numeric := coalesce(public.config_num('preco_prevenda'), 0);
  v_n integer;
  i integer;
begin
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 10 then raise exception 'quantidade fora de 1 a 10: %', p_quantidade; end if;
  if p_por is null or trim(p_por) = '' then raise exception 'informe quem está marcando'; end if;
  select * into v_lead from public.leads where id = p_lead;
  if v_lead.id is null then raise exception 'lead não encontrado: %', p_lead; end if;
  insert into public.lotes (id, nome, tamanho) values (1, 'Lote 1', coalesce(public.config_num('lote1_tamanho'), 250)::integer) on conflict (id) do nothing;
  for i in 1..p_quantidade loop
    select coalesce(max(numero), 0) + 1 into v_proximo from public.reservas where lote_id = v_lote;
    insert into public.reservas (lead_id, lote_id, numero, valor, status, reservado_em, reservado_por, observacao)
      values (p_lead, v_lote, v_proximo, v_valor, 'reservada', now(), p_por, p_observacao);
  end loop;
  update public.leads set reservou_em = coalesce(reservou_em, now()), reservou_por = coalesce(reservou_por, p_por), status_funil = 'reservado' where id = p_lead;
  -- Quem reservou sai das réguas automáticas (convite, lembrete da live, gravação, reaquecimento). O lembrete da
  -- Circular continua: é ato do processo legal, não mensagem de venda.
  update public.fila_envios set status = 'cancelado', motivo = 'reservou', processado_em = now()
    where lead_id = p_lead and status in ('pendente', 'processando') and tipo <> 'circular_lembrete';
  get diagnostics v_n = row_count;
  insert into public.lead_eventos (lead_id, tipo, origem, dados)
    values (p_lead, 'reservou', 'humano', jsonb_build_object('quantidade', p_quantidade, 'por', p_por, 'observacao', p_observacao, 'itens_cancelados', v_n, 'em', now()));
  return query select
    (select count(*)::integer from public.reservas r where r.lead_id = p_lead and r.status in ('reservada','paga')),
    public.reservas_confirmadas(1::smallint),
    coalesce(public.config_num('lote1_tamanho'), 250)::integer;
end $$;

-- Desfazer uma marcação errada: cancela as reservas abertas do lead e tira a marca. Os números do lote não são reaproveitados.
create or replace function public.lead_reserva_cancelar(p_lead uuid, p_por text, p_motivo text default null)
returns integer language plpgsql as $$
declare v_n integer;
begin
  update public.reservas set status = 'cancelada', cancelada_em = now(), cancelada_por = p_por
    where lead_id = p_lead and status = 'reservada';
  get diagnostics v_n = row_count;
  update public.leads set reservou_em = null, reservou_por = null,
    status_funil = case when status_funil = 'reservado' then (case when circular_recebida_em is not null then 'circular_recebida' else 'convidado' end) else status_funil end
    where id = p_lead;
  insert into public.lead_eventos (lead_id, tipo, origem, dados)
    values (p_lead, 'reserva_cancelada', 'humano', jsonb_build_object('reservas', v_n, 'por', p_por, 'motivo', p_motivo, 'em', now()));
  return v_n;
end $$;

-- A fila ignora quem reservou (salvo o lembrete da Circular).
create or replace function public.fila_proximos(p_limite integer default 20)
returns setof public.fila_envios language plpgsql as $$
begin
  return query
  with sel as (
    select f.id from public.fila_envios f
    join public.leads l on l.id = f.lead_id
    where f.status = 'pendente' and f.agendado_para <= now() and l.optout_em is null
      and (l.reservou_em is null or f.tipo = 'circular_lembrete')
    order by f.prioridade desc, f.agendado_para asc
    limit p_limite
    for update of f skip locked
  )
  update public.fila_envios f set status = 'processando', tentativas = f.tentativas + 1
  from sel where f.id = sel.id
  returning f.*;
end $$;

-- 2) "Pode cobrar" só depois do prazo legal contado da confirmação da Circular. Regra no banco, não no navegador.
create or replace view public.v_lead_cobranca as
select l.id as lead_id,
       l.circular_confirmada_em as confirmada_em,
       l.circular_confirmada_em + make_interval(days => coalesce(public.config_num('circular_prazo_dias'), 10)::integer) as liberado_em,
       l.circular_confirmada_em is not null
         and now() >= l.circular_confirmada_em + make_interval(days => coalesce(public.config_num('circular_prazo_dias'), 10)::integer) as pode_cobrar,
       case when l.circular_confirmada_em is null then null
            else greatest(0, ceil(extract(epoch from (l.circular_confirmada_em + make_interval(days => coalesce(public.config_num('circular_prazo_dias'), 10)::integer) - now())) / 86400))::integer end as dias_faltam
  from public.leads l;

-- 3) Lista do painel: uma linha por lead real (sem teste do Monitor), com o que o time precisa ver.
create or replace view public.v_painel_leads as
select l.id, l.nome, l.whatsapp, l.email, l.cidade, l.origem, l.tem_negocio, l.criado_em, l.status_funil, l.faixa,
       l.base_antiga, l.grupo_controle, l.optout_em, l.optout_motivo,
       l.convidado_em, l.contato_manual_em, l.contato_manual_por,
       l.circular_enviada_em, l.circular_confirmada_em, c.liberado_em, c.pode_cobrar, c.dias_faltam,
       l.reservou_em, l.reservou_por,
       (select count(*)::integer from public.reservas r where r.lead_id = l.id and r.status in ('reservada','paga')) as reservas_qtd,
       l.email_bloqueado_em, l.email_bloqueado_motivo, l.wa_invalido_em,
       l.pergunta_live, l.intencao,
       greatest(l.atualizado_em, coalesce(l.ultima_msg_lead_em, l.criado_em)) as atividade_em
  from public.leads l
  join public.v_lead_cobranca c on c.lead_id = l.id
 where not l.monitor_teste;

-- 4) Fila de aprovação da Fase A (revisor): itens que esperam decisão humana, com link assinado por aprovador.
create table if not exists public.aprovacoes (
  id             bigserial primary key,
  tipo           text not null,                     -- texto | email | whatsapp | peca | config
  titulo         text not null,
  conteudo       jsonb not null default '{}'::jsonb, -- {texto, html, assunto, ...}
  aprovador      text not null default 'principal', -- papel em painel_aprovadores
  status         text not null default 'pendente',  -- pendente | aprovado | editado | recusado
  criado_em      timestamptz not null default now(),
  criado_por     text,
  avisado_em     timestamptz,
  decidido_em    timestamptz,
  decidido_por   text,
  comentario     text,
  conteudo_final jsonb
);
create index if not exists aprovacoes_status_idx on public.aprovacoes (status, criado_em desc);
alter table public.aprovacoes enable row level security;

create or replace function public.aprovacao_decidir(p_id bigint, p_decisao text, p_por text, p_comentario text default null, p_conteudo_final jsonb default null)
returns void language plpgsql as $$
begin
  if p_decisao not in ('aprovado', 'editado', 'recusado') then raise exception 'decisão inválida: %', p_decisao; end if;
  update public.aprovacoes set status = p_decisao, decidido_em = now(), decidido_por = p_por, comentario = p_comentario,
    conteudo_final = case when p_decisao = 'editado' then p_conteudo_final else conteudo end
    where id = p_id and status = 'pendente';
  if not found then raise exception 'item % não está pendente', p_id; end if;
end $$;

-- 5) Chaves do painel: versão dos links (trocar invalida todos) e validade.
insert into public.config (chave, valor, publico, descricao) values
  ('painel_links_versao', '1', false, 'Versão dos links assinados do painel. Trocar o número invalida todos os links já enviados'),
  ('painel_url', '"https://prevenda.konioca.com/painel/"', false, 'Endereço do painel da Fase A')
on conflict (chave) do update set descricao = excluded.descricao;
