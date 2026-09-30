# Monitor técnico · plano para aprovação (30/09)

Nada daqui está publicado. Este documento é o plano que o Lucas pediu para ver antes do "sim".
O Guardião (agente 9) continua só revisando conteúdo, como está em `docs/11`. O Monitor técnico é um componente
novo, por código, sem chamar o modelo: detecta, alerta e propõe o ajuste. Nenhuma correção automática.

## 1. Onde cada coisa roda

| Componente | Onde roda | Por quê |
|---|---|---|
| Checagens por HTTP (LP no ar, links, saúde da lead-intake, pixels e Turnstile servidos, prévia do link) | Edge Function `monitor-checar`, cron a cada 15 min | Já temos cron, config e alertas no Supabase; sem custo novo |
| Teste de clique real em tela de celular | Cloudflare Worker com Browser Rendering (`konioca-monitor`), cron trigger | Navegador de verdade, mesma rede do Pages, mede carregamento como o usuário vê |
| Teste de carga | Script local (k6 ou Node) contra um branch do Supabase, nunca contra produção | Isola o banco e as functions de produção |
| Alertas | Tabela `alertas` (já existe) + e-mail pela exceção interna | Um alerta aberto por problema; fecha com aviso de volta ao normal |

Dependência nova: Browser Rendering fica na conta Cloudflare do projeto (plano Workers pago, US$ 5/mês, inclui
cota de navegador). Precisa de um token de API com escopo Workers para publicar o Worker. Edge Function não
roda navegador; por isso a parte por HTTP (`monitor-checar`) sai primeiro e o clique real entra quando o token
da Cloudflare existir.

## 2. Monitor técnico, parte por HTTP (`monitor-checar`), a cada 15 min

| Checagem | Como | Alerta quando |
|---|---|---|
| Site no ar | GET na LP e em /obrigado.html e /privacidade.html; tempo e status | Status diferente de 200, HTML vazio, ou mais de 2,5 s duas vezes seguidas |
| Formulário funcionando | GET `public-config` e OPTIONS (preflight CORS) na `lead-intake` com Origin da LP; sem criar lead | Erro, CORS sem a origem da LP, ou tempo acima de 8 s |
| Preço, datas, máquinas, frete, garantia | Baixa a LP, resolve os `data-tpl` com a config e compara com o texto renderizado pelo `public-config` | Qualquer valor fixo no HTML diferente da config |
| Links | Lista fixa: WhatsApp `wa.me/5511919451047` com o texto pré-preenchido esperado, /privacidade, obrigado, opt-out | Destino diferente, 404, redirect inesperado ou página vazia |
| Pixels e Turnstile | `public-config` com IDs preenchidos, `pixels.js` e `lp.js` servidos com os trechos certos, `challenges.cloudflare.com` respondendo 200 | ID vazio, script ausente ou Cloudflare fora |
| Prévia do link | Lê `og:title`, `og:description`, `og:image` (1200x630, menos de 1 MB, HTTP 200), `twitter:card` | Tag ausente, imagem quebrada ou tamanho errado |

Cadastro de ponta a ponta: uma vez por hora, pela lead-intake, com `utm_source=monitor` e e-mail
`monitor+<hora>@konioca.com`. O lead nasce marcado (`monitor_teste = true`) e a lead-intake pula planilha,
Circular, pixels e APIs de conversão quando vê a marca; o Monitor apaga o lead no fim da checagem. Na LP em
produção nada muda. Precisa de uma migração (coluna `monitor_teste`) e de um ajuste pequeno na lead-intake.

## 3. Monitor técnico, clique real em tela de celular (Cloudflare Browser Rendering)

Cloudflare Worker com Browser Rendering, cron `*/15 * * * *` e, no dia 15/10 entre 17h e 23h (Brasília),
`*/5 20-23,0-2 15-16 10 *` em UTC. Cada rodada:

1. Abre a LP em viewport de celular (390 x 844), mede `loadEventEnd` e LCP. Alerta se passar de 2,5 s em duas
   rodadas seguidas (guarda a última medição em KV).
2. Clica em cada botão e link e confere o destino exato contra a lista fixa acima. WhatsApp: confere o número e
   o texto pré-preenchido, decodificado. Qualquer diferença, 404 ou página vazia é alerta imediato.
3. Uma vez por hora faz o cadastro de ponta a ponta descrito no item 2 (mesma marca, mesma limpeza).
4. Grava o resultado em `monitor_rodadas` (Supabase, via function interna `monitor-registrar`) para o painel.

## 4. Plano B na página (mudança na LP, entra no branch para o Lucas aprovar o texto)

Na `lp.js`: o POST para a lead-intake ganha limite de 8 s. Se falhar ou estourar, a página guarda os campos
digitados no `localStorage`, mostra na hora um botão "Falar no WhatsApp" com o link `wa.me/5511919451047` e a
mensagem pronta ("Oi, quero minha vaga na live da pré-venda. Meu nome é {nome}."), e mantém o formulário
preenchido. Na próxima visita, ou quando a lead-intake voltar, a página reenvia sozinha o que ficou guardado e
limpa o `localStorage` só depois do 201. Nenhum lead se perde; o WhatsApp vira o canal enquanto a API não
responde. Texto do botão e da mensagem ficam na config (`planob_botao`, `planob_mensagem`) para aprovação.

## 5. Teste de carga até 12/10, fora da produção

Branch do Supabase (`supabase branches create carga`) com as mesmas migrações e functions, Turnstile desligado
na config do branch. Script k6: 500 cadastros em 5 minutos (1,7/s, com rajadas de 20/s por 15 s), dados
sintéticos, e-mails `carga+N@konioca.com`. Mede: tempo p95 da lead-intake, erros 5xx, `rate_limit_hit`
(o limite por IP de 8 em 10 min vai disparar; o teste roda com IPs simulados no cabeçalho ou com o limite
elevado só no branch), tamanho da fila `planilha_envios`, e o comportamento do Apps Script com 500 POSTs
(cota diária do Google: 20 mil execuções, mas o gargalo é o tempo por chamada, cerca de 1 s). Entrego: onde
travou, com número, e o ajuste proposto para cada gargalo. Custo: branch do Supabase cobrado por hora
enquanto existir; apago no mesmo dia.

## 6. Alertas

E-mail imediato para o aprovador principal (e WhatsApp quando o número oficial estiver ativo), tag `monitor`,
pela exceção interna da chave `envios_ativos` (só os três e-mails de `painel_aprovadores`).
Corpo: o que falhou, desde quando, última medição boa, ajuste proposto. Um alerta por problema (chave
`tipo + alvo`, sem repetir enquanto aberto) e um e-mail de volta ao normal quando duas rodadas seguidas passam.

## 7. Prévia do link da LP hoje (revisão única pedida em 30/09)

Como está: a LP em produção não tem nenhuma tag Open Graph nem Twitter Card. WhatsApp e Instagram montam a
prévia com o `<title>` e a `meta description`, sem imagem: o único ícone é o favicon, um PNG branco do logo,
que some em fundo claro.

Como aparece hoje no WhatsApp:

    Konioca · Pré-venda da nova geração
    Nova geração da máquina de cones de tapioca Konioca. Live de pré-lançamento com a Marcela.
    Garanta a sua pré-reserva no primeiro lote.
    prevenda.konioca.com

Sem imagem. No Instagram (DM) igual, só texto. Ajuste proposto, para o branch, depois do "sim":

    <meta property="og:type" content="website">
    <meta property="og:url" content="https://prevenda.konioca.com/">
    <meta property="og:title" content="Konioca · Pré-venda da nova geração">
    <meta property="og:description" content="Live fechada com a Marcela e pré-reserva da nova máquina de cones de tapioca. Vagas limitadas.">
    <meta property="og:image" content="https://prevenda.konioca.com/assets/img/previa-lp.jpg">
    <meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
    <meta property="og:locale" content="pt_BR">
    <meta name="twitter:card" content="summary_large_image">

Falta a imagem 1200 x 630 (JPG, até 300 KB): foto da máquina nova ou da Marcela com a máquina, fundo verde
da marca, sem texto pequeno. Quem manda a foto decide a prévia; sem foto, o fallback é o logo sobre o verde.
A descrição acima também vale como `meta description` nova, se aprovada. A frase "no primeiro lote" da
descrição atual conflita com a FAQ v3 (sem lote extra); a proposta tira isso.
