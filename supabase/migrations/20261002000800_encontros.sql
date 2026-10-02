-- Mudança de formato (Lucas, 2/10): a live no Instagram de 15/10 sai; entram encontros fechados no Google Meet com a Marcela,
-- até 35 pessoas por turma, até 30 minutos, durante o dia. Só quem está na lista participa. A reserva das 250 máquinas
-- acontece no fim de cada encontro, só para quem já pode (Circular confirmada há 10 dias).
-- Aplicar só com o SIM do Lucas (muda config e cron ao vivo).

-- 1) Turmas (encontros): data e hora, link do Meet, capacidade. Editáveis no painel.
create table if not exists public.encontros (
  id            bigserial primary key,
  inicio        timestamptz not null,
  duracao_min   integer not null default 30 check (duracao_min between 10 and 120),
  capacidade    integer not null default 35 check (capacidade between 1 and 500),
  meet_link     text,                                  -- https://meet.google.com/xxx-yyyy-zzz (preenchido pelo time)
  ativo         boolean not null default true,         -- false = some das opções (turma cancelada)
  observacao    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.encontros enable row level security;
create index if not exists encontros_inicio_idx on public.encontros (inicio);

alter table public.leads
  add column if not exists encontro_id bigint references public.encontros(id),
  add column if not exists encontro_escolhido_em timestamptz,
  add column if not exists encontro_presenca boolean,         -- null = não marcado; true = presente; false = faltou
  add column if not exists encontro_presenca_em timestamptz,
  add column if not exists encontro_presenca_por text;
create index if not exists leads_encontro_idx on public.leads (encontro_id);

-- 2) Config do formato novo. live_data fica sem uso nas páginas e nos e-mails.
insert into public.config (chave, valor, publico, descricao) values
  ('encontro_duracao_min', '30', true, 'Duração de cada encontro no Google Meet (minutos)'),
  ('encontro_capacidade',  '35', true, 'Capacidade padrão de cada turma do encontro (pessoas)'),
  ('encontro_lembrete_vespera_hora', '18', false, 'Hora (SP) do lembrete da véspera do encontro')
on conflict (chave) do update set descricao = excluded.descricao;
update public.config set valor = '"Google Meet"', descricao = 'Encontros fechados no Google Meet (formato de 2/10; a live no Instagram foi substituída)' where chave = 'live_plataforma';
update public.config set descricao = 'Sem uso desde 2/10 (formato trocado por encontros no Google Meet). Fica só por histórico.' where chave in ('live_data', 'live_link', 'live_duracao_min', 'live_gravacao_link', 'lembrete_live_min_antes');
update public.config set valor = (
  select to_jsonb(array(select distinct x from unnest(array(select jsonb_array_elements_text(valor)) || array['encontro_confirmacao','encontro_lembrete_vespera','encontro_lembrete_1h']) as x))
) where chave = 'msgs_tipos_isentos';

-- O cron da live (lembrete 1 h antes de live_data e gravação no dia seguinte) sai: o formato não existe mais.
select cron.unschedule('live-disparos') where exists (select 1 from cron.job where jobname = 'live-disparos');

-- 3) Turmas iniciais (sugestão do Lucas, até confirmar com a agenda da Marcela): a partir de 15/10, dias úteis, 10h, 14h e 16h,
--    até o fim da pré-venda (30/10). Link do Meet em branco: o time preenche no painel; a confirmação só sai com o link.
insert into public.encontros (inicio, duracao_min, capacidade)
select (d::date + h) at time zone 'America/Sao_Paulo', 30, 35
  from generate_series(date '2026-10-15', date '2026-10-30', interval '1 day') as d
  cross join (values (time '10:00'), (time '14:00'), (time '16:00')) as hs(h)
 where extract(isodow from d) between 1 and 5
   and not exists (select 1 from public.encontros);

-- 4) Leitura: vagas e presença por turma.
create or replace view public.v_encontros as
select e.id, e.inicio, e.duracao_min, e.capacidade, e.meet_link, e.ativo, e.observacao, e.criado_em, e.atualizado_em,
       (select count(*) from public.leads l where l.encontro_id = e.id and l.optout_em is null)::integer as inscritos,
       greatest(0, e.capacidade - (select count(*) from public.leads l where l.encontro_id = e.id and l.optout_em is null))::integer as vagas,
       (select count(*) from public.leads l where l.encontro_id = e.id and l.encontro_presenca is true)::integer as presentes
  from public.encontros e;

-- Opções para quem está na lista: turma ativa, com vaga, que começa daqui a mais de 30 minutos.
create or replace function public.encontros_disponiveis()
returns table (id bigint, inicio timestamptz, duracao_min integer, vagas integer)
language sql stable security definer set search_path = public as $$
  select v.id, v.inicio, v.duracao_min, v.vagas from public.v_encontros v
   where v.ativo and v.vagas > 0 and v.inicio > now() + interval '30 minutes'
   order by v.inicio
$$;

-- Lembretes por e-mail: véspera (hora da config, SP) e 1 hora antes. Só agenda o que ainda está no futuro.
create or replace function public.encontro_agendar_lembretes(p_lead uuid, p_encontro bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_inicio timestamptz;
  v_hora integer := coalesce(public.config_num('encontro_lembrete_vespera_hora'), 18)::integer;
  v_vespera timestamptz;
  v_1h timestamptz;
begin
  select inicio into v_inicio from public.encontros where id = p_encontro;
  if v_inicio is null then return; end if;
  v_vespera := ((v_inicio at time zone 'America/Sao_Paulo')::date - 1 + make_time(v_hora, 0, 0)) at time zone 'America/Sao_Paulo';
  v_1h := v_inicio - interval '60 minutes';
  if v_vespera > now() + interval '5 minutes' then perform public.fila_enfileirar(p_lead, 'encontro_lembrete_vespera', v_vespera, 'email'); end if;
  if v_1h > now() + interval '5 minutes' then perform public.fila_enfileirar(p_lead, 'encontro_lembrete_1h', v_1h, 'email'); end if;
end $$;

-- Escolha (ou troca) de horário pelo lead, pelo token. Turma cheia ou no passado recusa. Troca cancela os lembretes antigos.
create or replace function public.encontro_escolher(p_token text, p_encontro bigint)
returns table (ok boolean, motivo text, enc_id bigint, enc_inicio timestamptz, enc_duracao integer, enc_link text)
language plpgsql security definer set search_path = public as $$
declare
  v_lead public.leads%rowtype;
  v_enc public.encontros%rowtype;
  v_ins integer;
begin
  select * into v_lead from public.leads l where l.token = p_token;
  if v_lead.id is null then return query select false, 'link inválido', null::bigint, null::timestamptz, null::integer, null::text; return; end if;
  if v_lead.optout_em is not null then return query select false, 'saiu da lista', null::bigint, null::timestamptz, null::integer, null::text; return; end if;
  select * into v_enc from public.encontros e where e.id = p_encontro for update;
  if v_enc.id is null or not v_enc.ativo or v_enc.inicio <= now() + interval '30 minutes' then
    return query select false, 'horário indisponível', null::bigint, null::timestamptz, null::integer, null::text; return;
  end if;
  if v_lead.encontro_id is distinct from v_enc.id then
    select count(*) into v_ins from public.leads l where l.encontro_id = v_enc.id and l.optout_em is null;
    if v_ins >= v_enc.capacidade then return query select false, 'turma cheia', null::bigint, null::timestamptz, null::integer, null::text; return; end if;
    update public.leads set encontro_id = v_enc.id, encontro_escolhido_em = now(), encontro_presenca = null, encontro_presenca_em = null, encontro_presenca_por = null where id = v_lead.id;
    insert into public.lead_eventos (lead_id, tipo, origem, dados)
      values (v_lead.id, 'encontro_escolhido', 'lead', jsonb_build_object('encontro_id', v_enc.id, 'inicio', v_enc.inicio, 'anterior', v_lead.encontro_id));
    update public.fila_envios set status = 'cancelado', motivo = 'trocou de horário', processado_em = now()
      where lead_id = v_lead.id and status = 'pendente' and tipo in ('encontro_confirmacao', 'encontro_lembrete_vespera', 'encontro_lembrete_1h');
    perform public.fila_enfileirar(v_lead.id, 'encontro_confirmacao', now(), 'email');
    perform public.encontro_agendar_lembretes(v_lead.id, v_enc.id);
  end if;
  return query select true, null::text, v_enc.id, v_enc.inicio, v_enc.duracao_min, v_enc.meet_link;
end $$;

-- Painel: criar ou editar turma. Mudou a hora: lembretes pendentes das pessoas da turma são reagendados.
-- Desativar turma com inscritos é recusado (o time realoca as pessoas antes).
create or replace function public.encontro_salvar(
  p_id bigint, p_inicio timestamptz, p_duracao integer, p_capacidade integer, p_meet_link text, p_ativo boolean, p_por text
) returns table (ok boolean, motivo text, id bigint) language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := p_id;
  v_antes public.encontros%rowtype;
  v_ins integer;
  r record;
begin
  if p_id is null then
    insert into public.encontros (inicio, duracao_min, capacidade, meet_link, ativo)
      values (p_inicio, coalesce(p_duracao, 30), coalesce(p_capacidade, 35), nullif(trim(coalesce(p_meet_link, '')), ''), coalesce(p_ativo, true))
      returning encontros.id into v_id;
    return query select true, null::text, v_id; return;
  end if;
  select * into v_antes from public.encontros e where e.id = p_id for update;
  if v_antes.id is null then return query select false, 'turma não encontrada', null::bigint; return; end if;
  select count(*) into v_ins from public.leads l where l.encontro_id = p_id and l.optout_em is null;
  if coalesce(p_ativo, v_antes.ativo) = false and v_ins > 0 then return query select false, 'turma com inscritos: realoque as pessoas antes de desativar', null::bigint; return; end if;
  if p_capacidade is not null and p_capacidade < v_ins then return query select false, 'capacidade menor que os inscritos', null::bigint; return; end if;
  update public.encontros set
    inicio = coalesce(p_inicio, inicio), duracao_min = coalesce(p_duracao, duracao_min), capacidade = coalesce(p_capacidade, capacidade),
    meet_link = case when p_meet_link is null then meet_link else nullif(trim(p_meet_link), '') end,
    ativo = coalesce(p_ativo, ativo), atualizado_em = now()
    where id = p_id;
  if p_inicio is not null and p_inicio <> v_antes.inicio then
    for r in select l.id as lead_id from public.leads l where l.encontro_id = p_id and l.optout_em is null loop
      update public.fila_envios set status = 'cancelado', motivo = 'turma remarcada', processado_em = now()
        where lead_id = r.lead_id and status = 'pendente' and tipo in ('encontro_lembrete_vespera', 'encontro_lembrete_1h');
      perform public.encontro_agendar_lembretes(r.lead_id, p_id);
      insert into public.lead_eventos (lead_id, tipo, origem, dados) values (r.lead_id, 'encontro_remarcado', 'humano', jsonb_build_object('encontro_id', p_id, 'de', v_antes.inicio, 'para', p_inicio, 'por', p_por));
    end loop;
  end if;
  return query select true, null::text, p_id;
end $$;

-- Presença marcada pelo time no painel.
create or replace function public.encontro_presenca(p_lead uuid, p_presente boolean, p_por text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.leads set encontro_presenca = p_presente, encontro_presenca_em = now(), encontro_presenca_por = p_por where id = p_lead and encontro_id is not null;
  insert into public.lead_eventos (lead_id, tipo, origem, dados) values (p_lead, 'presenca', 'humano', jsonb_build_object('presente', p_presente, 'por', p_por));
end $$;

revoke all on function public.encontros_disponiveis() from public, anon, authenticated;
revoke all on function public.encontro_agendar_lembretes(uuid, bigint) from public, anon, authenticated;
revoke all on function public.encontro_escolher(text, bigint) from public, anon, authenticated;
revoke all on function public.encontro_salvar(bigint, timestamptz, integer, integer, text, boolean, text) from public, anon, authenticated;
revoke all on function public.encontro_presenca(uuid, boolean, text) from public, anon, authenticated;

-- 5) Painel: turma, presença e temperatura por lead (colunas no fim da view).
create or replace view public.v_painel_leads as
select l.id, l.nome, l.whatsapp, l.email, l.cidade, l.origem, l.tem_negocio, l.criado_em, l.status_funil, l.faixa,
       l.base_antiga, l.grupo_controle, l.optout_em, l.optout_motivo,
       l.convidado_em, l.contato_manual_em, l.contato_manual_por,
       l.circular_enviada_em, l.circular_confirmada_em, c.liberado_em, c.pode_cobrar, c.dias_faltam,
       l.reservou_em, l.reservou_por,
       (select count(*)::integer from public.reservas r where r.lead_id = l.id and r.status in ('reservada','paga')) as reservas_qtd,
       l.email_bloqueado_em, l.email_bloqueado_motivo, l.wa_invalido_em,
       l.pergunta_live, l.intencao,
       greatest(l.atualizado_em, coalesce(l.ultima_msg_lead_em, l.criado_em)) as atividade_em,
       public.origem_numeros(l.utm_source, l.utm_medium, l.referrer, l.utm_content) as canal,
       l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content,
       public.lead_temperatura(l) as temperatura,
       (select max(e.criado_em) from public.lead_eventos e where e.lead_id = l.id and e.tipo = 'respondeu') as respondeu_em,
       l.encontro_id, en.inicio as encontro_inicio, l.encontro_presenca, l.encontro_escolhido_em
  from public.leads l
  join public.v_lead_cobranca c on c.lead_id = l.id
  left join public.encontros en on en.id = l.encontro_id
 where not l.monitor_teste;
