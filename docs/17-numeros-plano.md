# Aba "Números" do painel · plano (1/10, para o "sim" do Lucas antes de construir)

Entra depois da Fase A (5/10), sem concorrer com ela. Público: os três aprovadores, na mesma página `/painel/`,
com o mesmo link assinado. Nada de ferramenta externa com conta e senha.

## O que a aba mostra

Filtros: período (hoje, 7 dias, 30 dias, tudo) e origem (Stories, Bio do Instagram, Bio do TikTok, WhatsApp, Direto,
Outros, Todas). Tabela por dia e linha de total.

| # | Indicador | De onde vem | Observação |
|---|---|---|---|
| 1 | Visitas à página e visitantes novos | Contagem própria: tabela `visitas_dia` alimentada por um sinal da própria LP | Sem cookie, sem IP, sem user agent, sem linha por pessoa: só contadores por dia e origem |
| 2 | Cadastros e taxa de cadastro | `leads` (fora base antiga e testes); taxa = cadastros ÷ visitantes novos | Contar sobre visitantes novos, não sobre visitas: quem recarrega a página não vira dois |
| 3 | E-mails enviados, entregues, devolvidos, spam | `mensagens` com `canal = email` (webhook do Resend, docs/16) | Por dia de envio e por tipo (convite, Circular, lembrete) |
| 4 | Circulares confirmadas e "pode cobrar" | `leads.circular_confirmada_em` e `v_lead_cobranca` | Por dia da confirmação |
| 5 | Reservas e placar das 250 | `reservas` (reservada + paga) por dia; máquinas somadas; placar X/250 | Mesma regra de `reservas_confirmadas` |

## Origem: uma regra só, no banco

Função SQL `origem_numeros(utm_source, utm_medium, referrer)` usada tanto nas visitas quanto nos leads, para que
visita e cadastro caiam na mesma gaveta:

| Gaveta | Regra (links de docs/08) |
|---|---|
| Stories | `instagram` + `stories` |
| Bio do Instagram | `instagram` + `bio` |
| Bio do TikTok | `tiktok` (qualquer medium) |
| WhatsApp | `whatsapp` |
| Direto | sem UTM e sem referrer |
| Outros | posts da Marcela, tráfego pago, indicação, base antiga, referrer de rede social sem UTM |

Primeiro toque: a LP já guarda a primeira origem da pessoa por 30 dias (`k_rastreio`). Visita e cadastro usam esse
primeiro toque, assim a taxa fecha. O sinal da visita manda também o link desta visita, guardado numa segunda
coluna: responde "qual story trouxe gente hoje" sem bagunçar a taxa.

## Como a visita é contada

1. `lp.js` dispara, ao carregar a LP e a página de obrigado, um `navigator.sendBeacon` para a function `visita`
   com: página, origem do primeiro toque (UTMs guardados), UTMs desta visita, domínio do referrer, e um sinal
   `nova = true` quando é a primeira vez naquele navegador (marca `k_visitou` no localStorage, sem data pessoal).
2. A function (pública, CORS da LP) só aceita o domínio `prevenda.konioca.com` (prévia e testes não contam), ignora
   `navigator.webdriver` e `utm_source` em `teste`/`monitor`, e chama `visita_registrar(...)`, que faz `upsert` dos
   contadores em `visitas_dia (dia, origem, origem_visita, pagina, visitas, novos)`.
3. Dia em America/Sao_Paulo. Nada é guardado por pessoa, então nada muda em retenção e anonimização (docs/10).
4. Limite: a function responde 204 sempre e descarta corpo acima de 1 KB. Bot que insiste infla visitas, não
   cadastros; a taxa cai e aparece. Se virar problema, Turnstile invisível na visita (mesma chave da config).

Cruzamento, não fonte: Cloudflare Web Analytics (grátis, sem cookie) pode ser ligado no Pages para conferir a ordem
de grandeza. Não dá o corte por UTM sem plano pago, por isso não serve como fonte.

## Peças a construir

| Peça | Conteúdo |
|---|---|
| Migração 720 | `visitas_dia`, `origem_numeros()`, `visita_registrar()`, função `numeros(p_de, p_ate)` que devolve uma linha por dia × origem com os cinco grupos de contadores, e `v_numeros_total` |
| Function `visita` | Pública, ~40 linhas, sem JWT, CORS de `cors_origens` |
| `lp.js` e `obrigado` | ~15 linhas: marca `k_visitou` e dispara o beacon |
| `painel-api` | Ação `numeros` ({de, ate}) para quem tem link válido; o filtro de origem é na tela |
| `painel.js` e `painel.css` | Aba "Números": chips de período e origem, tabela por dia, linha de total, placar |
| Testes | `tests/painel.test.mjs` ganha a regra de taxa e de formatação; `origem_numeros` testada por consulta SQL depois da migração (casos de docs/08) |
| Docs | Este arquivo vira "como está"; docs/08 ganha a coluna "gaveta nos Números" |

Ordem: migração e function `visita` primeiro (começam a contar desde o dia da publicação; não há como contar
visitas passadas), depois a aba. Antes da publicação: prévia da aba com dados reais de cadastros, e-mails e
Circulares, e o beacon testado contra a prévia (bloqueado pelo domínio, como esperado).

## Decisões para o Lucas

1. Taxa de cadastro sobre visitantes novos (marca no localStorage, sem identificação) ou sobre visitas brutas.
   Recomendação: visitantes novos, mostrando as visitas brutas ao lado.
2. Origem pelo primeiro toque como padrão (fecha com os cadastros), com a coluna "link da visita" à parte.
3. "Outros" como gaveta visível (posts, pago, indicação, base antiga) em vez de somar em alguma das cinco.
4. Ligar Cloudflare Web Analytics no Pages como cruzamento (um clique no painel do Cloudflare, sem custo).

## Fora do escopo desta aba

Funil por pessoa, tempo na página, mapas de calor, origem por cidade. Nada disso precisa de cookie, mas nenhum
muda decisão nesta fase.
