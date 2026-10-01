# Mudança de escopo de 30/09: fechamento com o time humano · plano e ordem

Nada daqui está publicado. Plano para o "sim" do Lucas. A Fase A (revisor, painel e e-mail) continua com prazo em 5/10.

## O que sai da fila (etapa 3)

Meio de pagamento, PIX, contrato na D4Sign, aceite dos termos e pedido pelo sistema saem do escopo do time de agentes.
Ficam com o time humano de fechamento. Nas propostas de `docs/11` isso zera o agente de pedido e a integração com
pagamento e assinatura. O que já existe no código sobre isso (nada em produção, só rascunho de textos em `docs/11`)
fica arquivado no próprio documento, marcado como "fora do escopo".

## O que continua

1. Circular: envio e registro do "Confirmo que recebi", como já está (circular-enviar, circular-confirmar, webhook do Resend, lembrete).
2. Painel: botão "reservou" por lead, com quantidade de máquinas, usado pelo time humano.
3. Painel: data em que o lead confirmou a Circular e aviso "pode cobrar" só quando tiverem passado 10 dias.

## Como fica cada item

### Botão "reservou"

Banco (migração, sem aplicar antes do "sim"): tabela `reservas` (lead_id, quantidade, reservado_em, reservado_por,
observacao) e no lead `reservou_em` + `status_funil = 'reservou'`. Função `lead_reservar(p_lead, p_quantidade, p_por)`:
grava a reserva, marca o lead, cancela na fila tudo que for convite, lembrete de live, gravação e reativação
(`fila_envios` pendentes do lead, exceto `circular_lembrete`, que é ato do processo legal) e devolve o contador.
Contador das 250: `reservas_lote1 = soma das quantidades em reservas` (view `v_placar`), lido pelo `public-config`
como já acontece com `reservas_lote1` e mostrado na LP quando `contador_visivel` estiver true.
Pós-venda: o lead com `reservou_em` entra na régua de pós-venda quando ela existir; até lá, silêncio total para ele
(a fila ignora leads com `reservou_em` preenchido, salvo `circular_lembrete`).
Painel: botão "Reservou" abre um campo de quantidade (1 a 10) e confirma; registra quem clicou.

### "Confirmou a Circular em" e "pode cobrar"

O dado já existe: `leads.circular_confirmada_em` (preenchido pelo clique em "Confirmo que recebi") e
`circular_prazo_dias = 10` na config. O painel mostra, por lead: data e hora da confirmação (fuso de São Paulo),
`liberado_em = confirmada_em + 10 dias` e o aviso "Pode cobrar desde dd/mm" só quando `now() >= liberado_em`.
Antes disso mostra "Falta X dias" em cinza, sem botão. Sem confirmação: "Circular não confirmada", em vermelho.
Vai como view `v_lead_cobranca` (lead_id, confirmada_em, liberado_em, pode_cobrar boolean), para o painel e para
a exportação. Regra fixa no banco, não no navegador, para o time nunca cobrar antes do prazo por engano.

## Ordem proposta

| # | Entrega | Quando | Depende de |
|---|---|---|---|
| 1 | Migração: `reservas`, `lead_reservar`, `v_placar`, `v_lead_cobranca`, fila ignorando reservados | 1/10 | "sim" neste plano |
| 2 | Painel (Fase A): lista de leads com data da Circular, "pode cobrar", botão "Reservou" com quantidade | até 5/10 | item 1 |
| 3 | Revisor e e-mail do painel (Fase A) | até 5/10 | aprovadores já na config (feito em 30/09) |
| 4 | Contador das 250 na LP ligado ao placar real (`contador_visivel`) | quando você mandar ligar | item 1 |
| 5 | Régua de pós-venda | depois da live, com o texto aprovado | itens 1 e 2 |

## Regra do convite com o link da live (e-mail E WhatsApp)

Config (migração 650, aplicada em 1/10): `convite_canais = ["email", "whatsapp"]` e `convite_whatsapp_ate = 12/10 23h59`.
Migração 660 (aguarda o "sim"): a fila cria um item por canal para cada lead novo (`convite_enfileirar`), a
deduplicação passa a ser por lead, tipo e canal, e quem já está na lista com convite só por WhatsApp ganha o item
de e-mail. O e-mail sai assim que `envios_ativos` for ligado. O item de WhatsApp espera o número oficial; se em
12/10 o WhatsApp oficial ainda não estiver ativo, a fila-processar cancela os itens de WhatsApp do convite com motivo
"whatsapp_nao_aprovado_ate_2026-10-12" e o e-mail sozinho dá conta. Com o WhatsApp ativo antes da data, os dois
canais saem, como o Lucas decidiu.

## Prévia do link e favicon

Feito no branch: tags Open Graph e Twitter Card, descrição sem "no primeiro lote" ("Garanta a sua pré-reserva"),
favicon e ícone de toque com fundo verde da marca, e uma imagem de prévia provisória (logo sobre o verde, 1200 x 630)
até a foto chegar. Quando a foto vier, entra em `site/assets/img/previa-lp.jpg` no lugar da provisória.

## Cloudflare: token e Workers pago, passo a passo (para o Monitor de clique real)

1. Entre em dash.cloudflare.com com a conta dona do domínio konioca.com.
2. No menu da esquerda, clique em "Workers & Pages". Se aparecer o aviso do plano, clique em "Manage plan"
   (ou "Gerenciar plano") e escolha "Workers Paid" (US$ 5 por mês). Confirme o cartão. Isso libera o Browser
   Rendering, que é o navegador de verdade que o Monitor usa para clicar na página.
3. Crie o token: clique na sua foto (canto superior direito) > "My Profile" > "API Tokens" > "Create Token".
4. Escolha o modelo "Edit Cloudflare Workers" e clique em "Use template".
5. Em "Account Resources" deixe "Include" e a conta da Konioca. Em "Zone Resources" deixe "All zones" ou escolha
   konioca.com. Não precisa mudar mais nada. Clique em "Continue to summary" e depois em "Create Token".
6. Copie o token (ele só aparece uma vez) e me mande pelo mesmo caminho seguro que usou para as outras chaves,
   com o nome CLOUDFLARE_API_TOKEN. Mande também o "Account ID", que está na página inicial de "Workers & Pages",
   na coluna da direita. Nenhum dos dois entra no repositório.
7. Depois do token, eu publico o Worker `konioca-monitor` e você vê a primeira rodada no painel de alertas.

Sem o token, a parte por HTTP do Monitor (`monitor-checar`) já roda no Supabase; só o clique real em tela de
celular espera a Cloudflare.
