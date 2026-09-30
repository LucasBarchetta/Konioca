-- Captação aberta antes das automações (decisão de 30/09).
-- 1. Página de obrigado: botão "Falar com o time no WhatsApp" no número atual da Konioca.
-- 2. Política de privacidade publicada em /privacidade.
-- 3. Planilha do time: só o SHA-256 da chave fica aqui; a chave vive na fórmula da planilha.
-- 4. Circular pendente sai sozinha quando PDF e Resend estiverem prontos.
insert into public.config (chave, valor, publico, descricao) values
  ('whatsapp_time_link', '"https://wa.me/5511919451047?text=Oi%2C%20me%20cadastrei%20na%20lista%20da%20pr%C3%A9-venda%20da%20nova%20Konioca%20e%20queria%20tirar%20uma%20d%C3%BAvida."', true, 'WhatsApp do time, (11) 91945-1047, com mensagem inicial. Botão da página de obrigado'),
  ('planilha_token_hash', '"[GERAR]"', false, 'SHA-256 (hex) da chave da planilha de leads (function leads-planilha). Trocar invalida a URL antiga')
on conflict (chave) do update set valor = excluded.valor, publico = excluded.publico, descricao = excluded.descricao;

update public.config set valor = '"https://prevenda.konioca.com/privacidade"', descricao = 'Política de privacidade publicada (rascunho em revisão pelo jurídico)'
where chave = 'politica_privacidade_url';

-- Cadastros sem Circular: tenta a cada 10 min, 50 por vez. Sem PDF ou sem Resend, para no primeiro e não gasta nada.
select cron.unschedule('circular-pendentes') where exists (select 1 from cron.job where jobname = 'circular-pendentes');
select cron.schedule('circular-pendentes', '*/10 * * * *', $$ select public.chamar_function('circular-enviar', '{"pendentes":true,"limite":50}') $$);
