-- Pixel da Meta da conta da Konioca (decisão do Lucas em 1/10): 1813006466712777 entra, 1703448091210683 sai.
-- O identificador vive só na config (pixels.js lê de public-config); o event_id do Lead (= id do lead) continua o mesmo
-- no pixel e na API de Conversões, então nada conta em dobro. O META_CAPI_TOKEN novo é gerado nesse pixel e salvo no
-- Supabase pelo Lucas; meta_capi_ativo só liga depois disso.
update public.config set valor = '"1813006466712777"' where chave = 'meta_pixel_id';
