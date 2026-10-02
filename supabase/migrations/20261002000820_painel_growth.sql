-- Papel "growth" no painel (pedido do Lucas em 2/10 à noite): vê tudo, marca contato e resposta, aprova roteiros de
-- vídeo (itens endereçados a 'growth'), propõe variações de teste A/B e comenta em qualquer item da aba Aprovações.
-- As permissões ficam em _shared/painel_regras.ts (permissoesDe) e a painel-api recusa o que o papel não pode.
-- Quem é growth está em config.painel_aprovadores (dados pessoais nunca entram no repositório).

comment on column public.aprovacoes.aprovador is 'Papel que decide o item: principal | conteudo | operacional | growth. Roteiro de vídeo com rosto ou voz da Marcela: um item para growth e um para conteudo; o principal pode decidir qualquer item.';

-- Comentários nos itens da aba Aprovações (qualquer papel com permissão de comentar; só registro, nada é enviado).
create table if not exists public.aprovacoes_comentarios (
  id           bigserial primary key,
  aprovacao_id bigint not null references public.aprovacoes(id) on delete cascade,
  por          text not null,              -- "Nome (papel)"
  texto        text not null,
  criado_em    timestamptz not null default now()
);
create index if not exists aprovacoes_comentarios_item_idx on public.aprovacoes_comentarios (aprovacao_id, criado_em);
alter table public.aprovacoes_comentarios enable row level security;

create or replace function public.aprovacao_comentar(p_id bigint, p_por text, p_texto text)
returns bigint language plpgsql as $$
declare v_id bigint;
begin
  if coalesce(btrim(p_texto), '') = '' then raise exception 'comentário vazio'; end if;
  if not exists (select 1 from public.aprovacoes where id = p_id) then raise exception 'item % não existe', p_id; end if;
  insert into public.aprovacoes_comentarios (aprovacao_id, por, texto) values (p_id, p_por, left(btrim(p_texto), 1000)) returning id into v_id;
  return v_id;
end $$;

-- Proposta de variação de teste A/B (growth): vira um item pendente para o principal, que decide. Nada é enviado.
create or replace function public.aprovacao_propor(p_tipo text, p_titulo text, p_conteudo jsonb, p_aprovador text, p_por text)
returns bigint language plpgsql as $$
declare v_id bigint;
begin
  if p_aprovador not in ('principal', 'conteudo', 'operacional', 'growth') then raise exception 'aprovador inválido: %', p_aprovador; end if;
  if coalesce(btrim(p_titulo), '') = '' then raise exception 'título vazio'; end if;
  insert into public.aprovacoes (tipo, titulo, conteudo, aprovador, criado_por) values (p_tipo, left(btrim(p_titulo), 200), coalesce(p_conteudo, '{}'::jsonb), p_aprovador, p_por) returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.aprovacao_comentar(bigint, text, text) from anon, authenticated;
revoke execute on function public.aprovacao_propor(text, text, jsonb, text, text) from anon, authenticated;
