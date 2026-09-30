# Operação da etapa 1: LP, leads e Circular

## Publicar pela primeira vez

1. Supabase (projeto `konioca-prevenda`):
   ```
   supabase link --project-ref <REF>
   supabase db push                      # aplica as três migrations
   supabase secrets set --env-file .env  # RESEND_API_KEY, RESEND_WEBHOOK_SECRET, SULTS_API_TOKEN
   supabase functions deploy
   ```
   No SQL Editor, guardar os dois segredos que o cron usa:
   ```sql
   select vault.create_secret('https://<REF>.supabase.co', 'project_url');
   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
   ```
2. Configuração: atualizar as chaves entre colchetes (`select chave, valor from config where valor::text like '%[%'`).
   ```sql
   update config set valor = '"https://prevenda.konioca.com.br"' where chave = 'lp_url';
   update config set valor = '["https://prevenda.konioca.com.br"]' where chave = 'cors_origens';
   update config set valor = '"https://chat.whatsapp.com/XXXX"' where chave = 'whatsapp_grupo_link';
   update config set valor = '"Time da Marcela <time@konioca.com.br>"' where chave = 'email_from';
   update config set valor = '"123456789012345"' where chave = 'meta_pixel_id';
   ```
3. Circular: subir o PDF no bucket `circular` (Storage, privado) e apontar `circular_storage_path` para `circular/<nome do arquivo>.pdf`.
4. Resend: domínio verificado; webhook em `https://<REF>.supabase.co/functions/v1/circular-webhook` com os eventos `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`.
5. Site: em `site/assets/js/env.js`, trocar `[PROJECT_REF]` pelo ref do projeto. Cloudflare Pages: diretório `site`, sem build. Domínio próprio apontado.

## Testar ponta a ponta (antes de 5/10)

1. Abrir a LP com `?utm_source=teste&utm_medium=manual`. Conferir: animação do preço, "61% MENOS", contagem regressiva, valores do card e da FAQ.
2. Cadastrar um lead interno com WhatsApp real. Esperado: página de obrigado, e-mail com a Circular em anexo em até 1 minuto, linha nova em `leads` com `origem = outro`, `utm_source = teste`, `consentimento_em` preenchido.
3. Tentar cadastrar o mesmo WhatsApp com outro e-mail. Esperado: vai para a página de obrigado com `n=0`, sem linha nova, sem novo e-mail, sem evento de conversão.
4. No e-mail, clicar em "Confirmo que recebi". Esperado: `circular_confirmada_em` preenchido; `circular_recebida_em` e `pagamento_liberado_em` (10 dias depois) preenchidos pelo webhook de entrega.
5. Clicar em "Não quero mais receber". Esperado: `optout_em` preenchido, `status_funil = saiu`.
6. Meta Events Manager (Test Events) e GA4 DebugView: um evento `Lead` / `generate_lead` na página de obrigado, só no cadastro novo.
7. Rodar a exportação: `curl -X POST -H "Authorization: Bearer <SERVICE_ROLE_KEY>" https://<REF>.supabase.co/functions/v1/sults-export`. Esperado: `exports/leads-AAAA-MM-DD.csv` no Storage.

## Operar

- Contador de reservas: `update config set valor = 'true' where chave = 'contador_visivel'` no dia 15/10, após a live. Só aparece quando houver reserva paga.
- PDF chegou depois do início da captação: subir o arquivo, ajustar `circular_storage_path` e rodar `POST /circular-enviar` com `{"pendentes": true}`. Envia para todos os cadastrados sem Circular, em ordem de cadastro.
- Reenviar para um lead: `POST /circular-enviar` com `{"lead_id": "...", "forcar": true}`.
- Quem pode reservar hoje: `select nome, whatsapp, pagamento_liberado_em from leads where lead_pode_pagar(id)`.
- Exportação diária para o Sults: 06:00 (São Paulo), arquivo em `exports/`. Para ligar a API quando a documentação chegar: `sults_modo = "api"`, `sults_endpoint` e o segredo `SULTS_API_TOKEN`; o mapeamento de campos está em `supabase/functions/sults-export/index.ts` e precisa ser conferido com a documentação do módulo Expansão.
- Mudar preço, data ou texto de valor: só na tabela `config`. A LP lê a cada carregamento (cache de 20 s).

## Desenvolver localmente

```
node scripts/mock-api.mjs      # site + API simulada em http://localhost:8080
./scripts/check.sh             # testes, deno check, lint, validacao.js atualizado
```
O mock lê os valores do seed SQL. Para simular o contador: `MOCK_CFG='{"contador_visivel":true,"reservas_lote1":37}' node scripts/mock-api.mjs`.
