-- Papéis e regra de aprovação do painel (pedido do Lucas em 2/10 à noite). A regra de quem decide cada item fica em
-- _shared/painel_regras.ts (regraAprovacao, revisarConteudo) e a painel-api recusa o que foge dela; aqui ficam as
-- decisões por papel, os comentários e a proposta de teste A/B. Quem é quem está só em config.painel_aprovadores.

alter table public.aprovacoes add column if not exists usa_marcela boolean not null default false;
comment on column public.aprovacoes.usa_marcela is 'Usa voz ou imagem da Marcela: ela também precisa aprovar (regraAprovacao).';
comment on column public.aprovacoes.aprovador is 'Papel de referência do item (aviso). Quem decide de fato vem de regraAprovacao(tipo, usa_marcela): mensagens para leads ou base = principal ou growth; roteiro de vídeo = growth; com a Marcela = ela também; operacional só comenta.';

-- Uma decisão por papel por item. O status do item fecha quando a regra é satisfeita (aprovacao_registrar).
create table if not exists public.aprovacoes_decisoes (
  id           bigserial primary key,
  aprovacao_id bigint not null references public.aprovacoes(id) on delete cascade,
  papel        text not null,
  por          text not null,              -- "Nome (papel)"
  decisao      text not null check (decisao in ('aprovado', 'editado', 'recusado')),
  comentario   text,
  em           timestamptz not null default now(),
  unique (aprovacao_id, papel)
);
alter table public.aprovacoes_decisoes enable row level security;

-- Comentários nos itens (qualquer papel com permissão de comentar; só registro, nada é enviado).
create table if not exists public.aprovacoes_comentarios (
  id           bigserial primary key,
  aprovacao_id bigint not null references public.aprovacoes(id) on delete cascade,
  por          text not null,
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

-- Registra a decisão de um papel e fecha o item quando a regra (passada pela API) é satisfeita:
-- basta um de p_qualquer e todos de p_todos aprovarem; uma recusa fecha como recusado.
create or replace function public.aprovacao_registrar(
  p_id bigint, p_papel text, p_por text, p_decisao text, p_comentario text, p_conteudo_final jsonb, p_qualquer text[], p_todos text[]
) returns text language plpgsql as $$
declare v_status text; v_ok text[]; v_por text;
begin
  if p_decisao not in ('aprovado', 'editado', 'recusado') then raise exception 'decisão inválida: %', p_decisao; end if;
  if not exists (select 1 from public.aprovacoes where id = p_id and status = 'pendente') then raise exception 'item % não está pendente', p_id; end if;
  insert into public.aprovacoes_decisoes (aprovacao_id, papel, por, decisao, comentario) values (p_id, p_papel, p_por, p_decisao, p_comentario)
    on conflict (aprovacao_id, papel) do update set por = excluded.por, decisao = excluded.decisao, comentario = excluded.comentario, em = now();
  if p_decisao = 'editado' and p_conteudo_final is not null then update public.aprovacoes set conteudo_final = p_conteudo_final where id = p_id; end if;
  select array_agg(papel) into v_ok from public.aprovacoes_decisoes where aprovacao_id = p_id and decisao in ('aprovado', 'editado');
  if exists (select 1 from public.aprovacoes_decisoes where aprovacao_id = p_id and decisao = 'recusado') then v_status := 'recusado';
  elsif (v_ok && p_qualquer) and (p_todos is null or cardinality(p_todos) = 0 or p_todos <@ v_ok) then
    v_status := case when exists (select 1 from public.aprovacoes_decisoes where aprovacao_id = p_id and decisao = 'editado') then 'editado' else 'aprovado' end;
  else v_status := 'pendente'; end if;
  if v_status <> 'pendente' then
    select string_agg(por, ' e ' order by em) into v_por from public.aprovacoes_decisoes
      where aprovacao_id = p_id and (case when v_status = 'recusado' then decisao = 'recusado' else decisao <> 'recusado' end);
    update public.aprovacoes set status = v_status, decidido_em = now(), decidido_por = v_por, comentario = p_comentario,
      conteudo_final = case when v_status = 'editado' then coalesce(conteudo_final, conteudo) when v_status = 'aprovado' then conteudo else conteudo_final end
      where id = p_id;
  end if;
  return v_status;
end $$;

-- Proposta de variação de teste A/B: vira item pendente, aprovado pelo principal ou growth (e pela Marcela se usar a imagem dela).
create or replace function public.aprovacao_propor(p_tipo text, p_titulo text, p_conteudo jsonb, p_aprovador text, p_por text, p_usa_marcela boolean default false)
returns bigint language plpgsql as $$
declare v_id bigint;
begin
  if p_aprovador not in ('principal', 'conteudo', 'operacional', 'growth') then raise exception 'aprovador inválido: %', p_aprovador; end if;
  if coalesce(btrim(p_titulo), '') = '' then raise exception 'título vazio'; end if;
  insert into public.aprovacoes (tipo, titulo, conteudo, aprovador, criado_por, usa_marcela)
    values (p_tipo, left(btrim(p_titulo), 200), coalesce(p_conteudo, '{}'::jsonb), p_aprovador, p_por, coalesce(p_usa_marcela, false)) returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.aprovacao_comentar(bigint, text, text) from anon, authenticated;
revoke execute on function public.aprovacao_registrar(bigint, text, text, text, text, jsonb, text[], text[]) from anon, authenticated;
revoke execute on function public.aprovacao_propor(text, text, jsonb, text, text, boolean) from anon, authenticated;
