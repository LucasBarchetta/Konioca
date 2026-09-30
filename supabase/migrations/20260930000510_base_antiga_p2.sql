-- Decisão de 30/09: P2 da base antiga recebe WhatsApp só se clicar no e-mail. Reavaliar depois de 15/10.
-- "lotes" volta à regra original da planilha (WhatsApp em lotes N horas depois do e-mail, mesmo sem clique).
insert into public.config (chave, valor, publico, descricao) values
  ('base_antiga_p2_regra', '"se_clicar"', false, 'Base antiga P2: se_clicar (WhatsApp só para quem clicou no e-mail, decisão de 30/09) | lotes (WhatsApp em lotes depois do e-mail). Reavaliar depois de 15/10')
on conflict (chave) do update set valor = excluded.valor, descricao = excluded.descricao;
