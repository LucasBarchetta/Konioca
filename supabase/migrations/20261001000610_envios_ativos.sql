-- Chave mestra de envio (30/09). Enquanto envios_ativos = false, nenhuma mensagem sai por nenhum canal:
-- e-mail (Resend, inclusive Circular e lembrete), WhatsApp (Cloud API) e o worker da fila.
-- A checagem fica nos pontos de saída (_shared/email.ts, _shared/circular.ts, _shared/whatsapp.ts) e no fila-processar,
-- então vale para qualquer rotina, atual ou futura. Itens da fila esperam sem gastar tentativa.
-- Ligar: update config set valor = 'true' where chave = 'envios_ativos';
insert into public.config (chave, valor, publico, descricao) values
  ('envios_ativos', 'false', false, 'Chave mestra: false = nenhuma mensagem sai (e-mail, WhatsApp, Circular, fila). Ligar só com decisão explícita do Lucas')
on conflict (chave) do update set descricao = excluded.descricao;

-- CORS: só o domínio final e o projeto do Cloudflare Pages (curinga restrito a *.konioca.pages.dev). Sem localhost em produção.
update public.config
set valor = '["https://prevenda.konioca.com", "https://konioca.pages.dev", "https://*.konioca.pages.dev"]',
    descricao = 'Origens aceitas pelas functions públicas: domínio final e prévias do projeto konioca no Pages. Origem exata ou curinga de subdomínio de um domínio próprio'
where chave = 'cors_origens';
