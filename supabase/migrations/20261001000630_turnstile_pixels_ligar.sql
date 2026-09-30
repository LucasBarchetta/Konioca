-- Liga Turnstile e pixels. Aplicar SÓ depois de publicar a lead-intake nova: a antiga lê outro nome de segredo
-- (TURNSTILE_SECRET) e, com turnstile_ativo = true, recusaria todo cadastro.
-- Códigos públicos recebidos em 30/09.
update public.config set valor = '"0x4AAAAAAFKlOAqhnTRvfA4h"' where chave = 'turnstile_site_key';
update public.config set valor = '"1703448091210683"' where chave = 'meta_pixel_id';
update public.config set valor = '"DAUOIDJC77U17TEHU9VG"' where chave = 'tiktok_pixel_id';
-- Turnstile ligado no formulário e na lead-intake (segredo TURNSTILE_SECRET_KEY nas functions).
update public.config set valor = 'true' where chave = 'turnstile_ativo';
-- API de Conversões da Meta continua desligada até META_CAPI_TOKEN existir (chega até 4/10).

