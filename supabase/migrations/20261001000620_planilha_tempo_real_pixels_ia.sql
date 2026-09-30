-- Acessos de 30/09: planilha em tempo real, Turnstile, pixels e custo da API da Anthropic.
-- Ordem de aplicação: PRIMEIRO publicar lead-intake e planilha-processar novos, DEPOIS esta migration
-- (turnstile_ativo = true com a lead-intake antiga recusaria todo cadastro, porque ela lê outro nome de segredo).

-- Planilha em tempo real: uma linha por lead novo; o lead-intake tenta na hora e o cron retenta o que falhar.
create table if not exists public.planilha_envios (
  id          bigserial primary key,
  lead_id     uuid not null references public.leads(id) on delete cascade,
  status      text not null default 'pendente',   -- pendente | enviado | falhou | cancelado
  tentativas  integer not null default 0,
  proximo_em  timestamptz not null default now(),
  motivo      text,
  criado_em   timestamptz not null default now(),
  enviado_em  timestamptz
);
create index if not exists planilha_envios_pend_idx on public.planilha_envios (status, proximo_em) where status = 'pendente';
create unique index if not exists planilha_envios_lead_idx on public.planilha_envios (lead_id);
alter table public.planilha_envios enable row level security;

-- Custo da API da Anthropic: uma linha por chamada, com o custo estimado pela tabela de preços da config.
create table if not exists public.ia_chamadas (
  id                 bigserial primary key,
  rotina             text not null,
  modelo             text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  custo_usd          numeric(12,6),
  sem_preco          boolean not null default false,
  criado_em          timestamptz not null default now()
);
create index if not exists ia_chamadas_criado_idx on public.ia_chamadas (criado_em);
alter table public.ia_chamadas enable row level security;

create or replace view public.v_ia_custo as
select date_trunc('day', criado_em at time zone 'America/Sao_Paulo')::date as dia, rotina, modelo,
       count(*) as chamadas, sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens, sum(custo_usd) as custo_usd
from public.ia_chamadas group by 1, 2, 3 order by 1 desc;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

insert into public.config (chave, valor, publico, descricao) values
  ('ia_precos_usd',      '{"claude-opus-5-5": {"in": 4, "out": 20, "cache_read": 0.2, "cache_write": 5}, "claude-sonnet-5-5": {"in": 2, "out": 10, "cache_read": 0.2, "cache_write": 2.5}, "claude-haiku-4-5": {"in": 1, "out": 5, "cache_read": 0.1, "cache_write": 1.25}}', false, 'US$ por milhão de tokens, por modelo (tabela da Anthropic em 25/09/2026). Atualizar se a Anthropic mudar'),
  ('ia_alerta_usd',      '50',    false, 'Abre alerta (tipo ia_custo) quando o acumulado desde ia_custo_desde passar deste valor'),
  ('ia_custo_desde',     '"2026-09-30T00:00:00-03:00"', false, 'Início da contagem do custo da API da Anthropic'),
  ('anthropic_key_vence','"2026-12-30"', false, 'Validade da ANTHROPIC_API_KEY (créditos pré-pagos, sem recarga automática)'),
  ('tiktok_eapi_ativo',  'false', false, 'Enviar SubmitForm pela Events API do TikTok (precisa de TIKTOK_ACCESS_TOKEN). Sem token, pula em silêncio'),
  ('planilha_tempo_real_ativa', 'true', false, 'Cada lead novo vira linha na aba Tempo real (SHEETS_WEBHOOK_URL/TOKEN). Falha entra na fila planilha_envios')
on conflict (chave) do update set descricao = excluded.descricao;

-- Códigos públicos recebidos em 30/09.
update public.config set valor = '"0x4AAAAAAFKlOAqhnTRvfA4h"' where chave = 'turnstile_site_key';
update public.config set valor = '"1703448091210683"' where chave = 'meta_pixel_id';
update public.config set valor = '"DAUOIDJC77U17TEHU9VG"' where chave = 'tiktok_pixel_id';
-- Turnstile ligado no formulário e na lead-intake (segredo TURNSTILE_SECRET_KEY nas functions).
update public.config set valor = 'true' where chave = 'turnstile_ativo';
-- API de Conversões da Meta continua desligada até META_CAPI_TOKEN existir (chega até 4/10).

select cron.unschedule('planilha-processar') where exists (select 1 from cron.job where jobname = 'planilha-processar');
select cron.schedule('planilha-processar', '*/5 * * * *', $$ select public.chamar_function('planilha-processar') $$);
