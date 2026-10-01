-- Aprovadores do painel (30/09). Lista privada em config.painel_aprovadores; os dados reais são preenchidos
-- direto no banco (nunca no repositório). Enquanto o WhatsApp oficial não estiver ativo, o aviso vai por e-mail.
-- Exceção da chave envios_ativos: só o aviso do painel (tag "painel") para um e-mail desta lista sai com a chave em false.
insert into public.config (chave, valor, publico, descricao) values
  ('painel_aprovadores', '[
    {"nome": "[NOME]", "email": "[EMAIL PRINCIPAL]", "whatsapp": "[E164]", "papel": "principal",   "escopo": "Todo conteúdo. Aprovação final de tudo."},
    {"nome": "[NOME]", "email": "[EMAIL CONTEUDO]",  "whatsapp": "[E164]", "papel": "conteudo",    "escopo": "Conteúdo em que ela aparece ou fala. Precisa do ok dela e do principal."},
    {"nome": "[NOME]", "email": "[EMAIL OPERACIONAL]", "whatsapp": "[E164]", "papel": "operacional", "escopo": "Só informação operacional (prazos, pagamento, entrega, cadastro)."}
  ]', false, 'Quem aprova no painel e por qual canal. Únicos destinatários internos liberados na exceção da chave envios_ativos (tag painel). Preencher no banco, nunca no repositório'),
  ('painel_aviso_canal', '"email"', false, 'Canal do aviso de aprovação pendente: email até o WhatsApp oficial estar ativo; depois, whatsapp')
on conflict (chave) do update set descricao = excluded.descricao;
