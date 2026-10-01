# Aba "Desempenho" do painel · plano (substitui a aba "Números"; decisão do Lucas em 1/10)

Dashboard por canal, para os três aprovadores, na mesma página `/painel/` e com o mesmo link assinado. Prazo: 8/10,
para ter uma semana de dados antes da live de 15/10. Prévia antes de publicar.

## O que já está no ar (1/10)

Migração 720: `visitas_dia`, `origem_numeros`, `visita_registrar`. Function `visita` e o sinal `K.visita` em `comum.js`
(LP e página de obrigado). Migração 730: `origem_numeros` com `utm_content`, para separar P1, P2 e P3/P4 do e-mail da
base antiga. Contagem só do domínio oficial, sem cookie, sem IP, sem user agent, só contadores por dia e canal.

## Regras

- Tudo pela origem de primeiro toque (`k_rastreio`, 30 dias). Visita e cadastro na mesma gaveta, assim a taxa fecha.
- Sem testes (`utm_source` teste/monitor, leads do Monitor) e sem base antiga importada: a base antiga só conta quando a
  pessoa se cadastra pela página (vira lead com `utm_source=base`).
- Canais: Stories, Bio do Instagram, Bio do TikTok, WhatsApp, E-mail base antiga P1, P2 e P3/P4 (separados), Convite,
  Direto, Outros. Anúncios pagos entram como canais próprios quando existirem (`utm_medium=cpc`, por `utm_campaign`).
- Funciona no celular e se atualiza sozinho como o resto do painel (30 s com a página visível).

## Filtro de período no topo

Hoje, últimos 7 dias, desde o início. Dia em America/Sao_Paulo.

## Entrega em duas partes (decisão do Lucas em 1/10)

- Parte 1, 2/10, depois do disparo do P2: blocos 1 (resumo), 2 (tabela por canal) e 5 (disparos de e-mail), com o
  filtro de período e a atualização automática. Fica na prévia até o SIM.
- Parte 2, 5/10: blocos 3 (funil), 4 (gráfico por dia) e 6 (links com mais cadastros).
- A aba só lê: nenhuma ação dela envia mensagem ou altera lead ou fila (ação `desempenho` da painel-api é só leitura).

## Blocos, nesta ordem

1. Resumo: visitantes novos, cadastros, taxa de cadastro, Circulares confirmadas, reservas, placar das 250.
2. Tabela por canal, ordenada por cadastros: visitantes, cadastros, taxa de cadastro, Circulares confirmadas, reservas,
   taxa de reserva sobre cadastros.
3. Funil por canal: visita, cadastro, Circular confirmada, reserva, com a perda em cada etapa.
4. Gráfico de cadastros por dia, uma linha por canal (SVG gerado no próprio painel.js, sem biblioteca externa).
5. Disparos de e-mail, um por linha: enviados, entregues, devolvidos, spam, cliques, cadastros, taxa de cadastro sobre
   entregues. Clique = visita com o link do disparo (`origem_visita`), já que o rastreio de clique do Resend fica
   desligado.
6. Links com mais cadastros no período (`utm_source` + `utm_medium` + `utm_content`).

## Peças a construir

| Peça | Conteúdo |
|---|---|
| Migração 740 | Função `desempenho(p_de, p_ate)` devolvendo um JSON com os seis blocos, calculado no banco (leads, mensagens, reservas, visitas_dia), sem dado pessoal |
| `painel-api` | Ação `desempenho` ({periodo: hoje, 7d, tudo}) para quem tem link válido |
| `painel.js` e `painel.css` | Aba "Desempenho": chips de período, cartões do resumo, tabela, funil, gráfico SVG, tabela de disparos, lista de links |
| Testes | Regras de formatação e taxas em `tests/painel.test.mjs`; `desempenho()` conferida por consulta SQL |
| Docs | Este arquivo vira "como está"; docs/08 ganha a coluna "canal no painel" |

## Cloudflare Web Analytics (cruzamento, depende do Lucas)

1. dash.cloudflare.com, conta da Konioca, menu "Workers & Pages", projeto do site (prevenda.konioca.com).
2. Aba "Metrics" do projeto. Em "Web Analytics", botão "Enable". O Pages injeta o script sozinho; nada muda no repositório.
3. Para ver: menu "Analytics & Logs" > "Web Analytics" > o site. Começa a contar na hora; sem cookie.
4. Conferir uma vez por semana a ordem de grandeza: visitas do Cloudflare x `visitas_dia`. Diferença de até 20% é
   normal (bloqueadores de script, bots filtrados de jeitos diferentes). Diferença maior é sinal para investigar.

## Correção de 1/10 à noite: utm_content no contador

A function `visita` passava só utm_source, utm_medium e referrer, e os cliques dos e-mails da base antiga caíam todos em "base_email" (o clique do P1 de 1/10 está nessa gaveta). Migração 780: `visita_registrar` recebe o utm_content do primeiro toque e do link da visita; gavetas base_p1, base_p2, base_p2_a, base_p2_b (teste A/B do P2) e base_p34. O painel mostra "E-mail base antiga P2 (A)" e "(B)".
