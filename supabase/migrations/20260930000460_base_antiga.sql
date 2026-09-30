-- Base antiga (1.210 pessoas exportadas do Sults): tabela de preparação.
-- Recebe a planilha já normalizada pelo scripts/base_antiga_preparar.py. Não cria lead nem dispara nada:
-- a promoção para leads e a fila de envios são da etapa 2 (function base-antiga-importar).
-- Dados pessoais: esta tabela é a única cópia fora do Sults/Drive. Nada disso vai para o repositório.

create table if not exists public.base_antiga (
  id                 bigserial primary key,
  email              text not null,
  email_norm         text generated always as (lower(btrim(email))) stored,
  nome               text not null,
  primeiro_nome      text,
  whatsapp_bruto     text,
  whatsapp_e164      text,                 -- só quando o número é celular completo e válido
  whatsapp_ok        boolean not null default false,
  cidade             text,
  uf                 text,
  regiao             text,
  primeiro_contato   timestamptz,
  ultimo_contato     timestamptz,
  n_cadastros        integer,
  sults_ids          text,
  prioridade         text not null,        -- P1 | P2 | P3 | P4
  prioridade_rotulo  text,
  canal_inicial      text not null,        -- whatsapp_email | email_depois_whatsapp_lotes | email_whatsapp_se_clicar
  canal_inicial_rotulo text,
  gancho             text,                 -- "fev/26": mês do primeiro contato
  observacoes        text,
  revisar            boolean not null default false,  -- possível cadastro de teste: fica fora dos envios até revisão humana
  status             text not null default 'importado', -- importado | lead_criado | revisar | ignorado
  lead_id            uuid references public.leads(id),
  erro               text,
  carga              text,                 -- identificador da carga (arquivo e data)
  importado_em       timestamptz not null default now(),
  constraint base_antiga_email_unico unique (email_norm),
  constraint base_antiga_prioridade check (prioridade in ('P1','P2','P3','P4')),
  constraint base_antiga_canal check (canal_inicial in ('whatsapp_email','email_depois_whatsapp_lotes','email_whatsapp_se_clicar')),
  constraint base_antiga_whats check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+55[1-9][0-9]9[0-9]{8}$'),
  constraint base_antiga_status check (status in ('importado','lead_criado','revisar','ignorado'))
);
create index if not exists base_antiga_status_idx on public.base_antiga (status, prioridade);
comment on table public.base_antiga is 'Base antiga do Sults, normalizada. Dados pessoais: uso restrito à pré-venda, opt-out em toda mensagem.';

alter table public.base_antiga enable row level security;
revoke all on public.base_antiga from anon, authenticated;
revoke all on sequence public.base_antiga_id_seq from anon, authenticated;
