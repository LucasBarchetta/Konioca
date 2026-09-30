-- Origens do Cloudflare Pages liberadas até o domínio próprio (prevenda.konioca.com) ficar pronto.
-- "https://*.konioca.pages.dev" cobre as prévias por commit e por branch. Retirar as duas depois da virada.
update public.config
set valor = '["https://prevenda.konioca.com", "https://konioca.pages.dev", "https://*.konioca.pages.dev", "http://localhost:8080"]',
    descricao = 'Origens aceitas pelas functions públicas. Aceita origem exata ou curinga de subdomínio (https://*.dominio). As de pages.dev são provisórias'
where chave = 'cors_origens';
