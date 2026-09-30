# Contas e chaves que um humano precisa criar

Ordem por bloqueio. O que está no topo trava a captação de 5/10. Cada item diz o que fazer, o que me entregar e onde a chave entra.

| # | Bloqueia | O que criar | O que me entregar | Onde entra |
|---|---|---|---|---|
| 1 | Tudo da etapa 1 | Feito em 30/09: projeto "KONIOCA pre venda", ref `ytsildpxummevfkjcjhs`, us-east-2 (Ohio), plano Pro. Migrations aplicadas e functions publicadas. Falta só guardar a chave de serviço no Vault (ver `docs/04-operacao-etapa-1.md`) | A chave `service_role` (legada, formato JWT) | Vault `service_role_key`, para o cron |
| 2 | LP no ar | Cloudflare Pages: projeto `konioca-prevenda` ligado a este repositório, diretório `site/`, produção na branch `main`. Domínio `prevenda.konioca.com` com CNAME na Hostinger (`docs/05-dns-hostinger.md`) | Confirmação do endereço `.pages.dev` | CNAME `prevenda` |
| 3 | E-mail da Circular e plano B | Conta Resend, domínio `envio.konioca.com` (região us-east-1) com os registros de `docs/05-dns-hostinger.md`, webhook apontando para `https://ytsildpxummevfkjcjhs.supabase.co/functions/v1/circular-webhook` com os eventos `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained` | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` e a chave DKIM | Segredos das functions; remetente `time@envio.konioca.com` já gravado |
| 4 | E-mail da Circular | PDF da Circular de Oferta de Franquia da nova geração, aprovado pelo jurídico | O arquivo | Upload no bucket `circular` (privado); caminho em `config.circular_storage_path` |
| 5 | Pixels no ar em 5/10 | IDs do Meta Pixel, TikTok Pixel e GA4 (propriedade nova ou existente). No Events Manager do pixel, gerar o token da API de Conversões | Os três IDs e o token da API de Conversões | `config.meta_pixel_id`, `tiktok_pixel_id`, `ga4_id`; `META_CAPI_TOKEN` e `config.meta_capi_ativo` |
| 5b | Cadastro no ar em 5/10 | Cloudflare Turnstile: widget para o domínio da LP (modo Managed) | Site key e secret key | `config.turnstile_site_key`, `config.turnstile_ativo`; `TURNSTILE_SECRET` |
| 6 | Obrigado e e-mail | Link do grupo/comunidade do WhatsApp da pré-venda, link da live (Meet ou YouTube não listado), política de privacidade e termos da pré-venda publicados | Os quatro links | `config.whatsapp_grupo_link`, `live_link`, `politica_privacidade_url`, `termos_prevenda_url` |
| 7 | Etapa 2 (WhatsApp) | Meta Business: verificação da empresa, conta WhatsApp Business (WABA), número dedicado, token permanente de sistema, webhook. Aquecimento do número começa já. Templates enviados para aprovação antes de 5/10 (eu escrevo os textos na etapa 2) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Segredos das functions |
| 8 | Etapa 1 (CRM) | Sults: usuário de API no módulo Segurança, token, e a documentação do módulo Expansão (ou confirmação de que vamos de CSV) | `SULTS_API_TOKEN`, URL base e um exemplo de payload aceito | `SULTS_*`; `config.sults_modo` |
| 9 | Etapa 3 (reserva) | PSP com PIX e webhook: Asaas, Pagar.me ou Stripe BR [A DEFINIR]. Conta PJ da Konioca Franquias e Equipamentos Ltda | Chave de API e segredo do webhook | `PIX_API_KEY`, `PIX_WEBHOOK_SECRET` |
| 10 | Etapa 3 (contrato) | D4Sign: conta, cofre, modelo do contrato aprovado pelo jurídico com campos variáveis, termos da reserva com a regra de não devolução | `D4SIGN_TOKEN`, `D4SIGN_CRYPT_KEY`, id do cofre e do modelo | Segredos das functions; `config.d4sign_*` |
| 11 | Etapa 3 (financiamento) | Bradesco: contato e procedimento de encaminhamento, uso do nome aprovado por escrito | E-mail/canal de encaminhamento e o texto autorizado | `config.financiamento_*` |
| 12 | Etapa 4 (agentes) | Conta Anthropic Console com chave de API e limite de gasto | `ANTHROPIC_API_KEY` | Segredos das functions |
| 13 | Etapa 5 (painel) | Nada novo. Acesso ao painel por link com senha única (`PAINEL_SENHA`) ou login Supabase Auth dos operadores | Lista de e-mails dos operadores | `config.painel_operadores` |

Itens 1 a 6 (incluindo 5b) precisam estar prontos até 3/10 para a captação começar em 5/10 com um dia de folga para teste.

## Sequência sugerida para hoje

1. Supabase (item 1). Sem ele nada roda.
2. Meta Business e WABA (item 7). É o de prazo mais longo; abre hoje mesmo, em paralelo com o resto.
3. Cloudflare Pages e domínio (item 2).
4. Resend e DNS (item 3), PDF da Circular (item 4).
5. Pixels (item 5) e links (item 6).

## O que eu aplico assim que receber cada chave

- Item 1: `supabase link`, `supabase db push`, `supabase functions deploy`, `supabase secrets set`.
- Item 2: primeiro deploy da LP, teste de cadastro ponta a ponta, CORS fechado no domínio final.
- Item 3 e 4: upload do PDF, teste de envio da Circular para um e-mail interno, checagem do webhook.
- Item 5 e 6: atualização da `config` via SQL, teste dos eventos de conversão com o Meta Events Manager e o GA4 DebugView.
