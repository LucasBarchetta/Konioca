# Devoluções e spam em qualquer e-mail · plano (1/10, para aprovar antes de publicar)

Prazo: no ar antes de 5/10, primeiro envio para a base antiga.

## O que existe hoje

O Resend chama a function `circular-webhook` (assinatura Svix obrigatória, segredo `RESEND_WEBHOOK_SECRET`). Ela trata
a Circular por completo (entrega, abertura, devolução) e, para os outros e-mails, só troca o status na tabela
`mensagens` (devolução vira "falhou") e registra o clique. Nada bloqueia o endereço, nada fica no lead, nada pausa trilha.
Resultado prático de hoje: o convite para hotmail.co saiu e, se voltar, ninguém fica sabendo.

## O que muda

1. Um webhook só para todos os e-mails. A URL continua a mesma (`/circular-webhook`, já cadastrada no Resend), para não
   mexer no Resend. Por dentro, todo evento passa por uma regra única, pura e testada (`_shared/email_eventos.ts`):
   - `email.bounced` com tipo "hard" (endereço inexistente, domínio inexistente): status da mensagem vira `devolvido`;
     o endereço entra na lista de bloqueio; o lead recebe o evento `email_devolvido` com data, motivo do provedor e
     qual e-mail era (convite, base antiga, Circular, lembrete).
   - `email.bounced` com tipo "soft" (caixa cheia, servidor fora do ar): só registra no lead (`email_devolucao_temporaria`).
     Na segunda temporária em 7 dias para o mesmo endereço, bloqueia como se fosse definitiva.
   - `email.complained` (marcou como spam): status `spam`; endereço bloqueado; evento `email_spam` no lead.
     Proposta: spam bloqueia só o e-mail, o WhatsApp segue a regra normal. Se preferir que spam encerre tudo (como o
     opt-out), é uma linha de config.
   - Entrega, abertura e clique continuam como hoje.

2. Bloqueio por endereço, não só por lead. Tabela nova `emails_bloqueados` (e-mail em minúsculas, motivo, data, id da
   mensagem que causou). O bloqueio segue o endereço mesmo se a pessoa se cadastrar de novo ou vier pela base antiga.
   No lead, as colunas `email_bloqueado_em` e `email_bloqueado_motivo` deixam o painel mostrar o estado na hora.

3. Nenhum envio para endereço bloqueado, em qualquer tipo. A verificação entra no único ponto de saída de e-mail
   (`_shared/email.ts`, usado por convite, base antiga, lembretes e avisos) e no módulo da Circular. A fila marca o
   item como `pulado`, motivo `email_bloqueado`, sem gastar tentativa e sem erro.

4. Desbloqueio só por correção humana. Quando o time corrige o e-mail de um lead (como fiz com a Erica), o lead sai
   do bloqueio e o endereço antigo continua bloqueado. Isso vira a ação "corrigir e-mail" no painel da Fase A, com o
   evento `email_corrigido` que já existe.

5. Pausa automática da trilha da base antiga. A cada devolução de um e-mail `base_antiga_email`, o webhook calcula o dia
   (fuso de São Paulo): enviados no dia e devolvidos definitivos no dia. Com pelo menos 20 enviados no dia
   (`base_antiga_devolucao_minimo`, para 1 devolução em 10 não pausar) e devolvidos acima de 3%
   (`base_antiga_devolucao_max_pct`), a trilha pausa sozinha:
   - `config.base_antiga_pausada = true`, com data e motivo;
   - `base-antiga-processar` e a fila param de tratar `base_antiga` e `base_antiga_email` (itens ficam pendentes com
     motivo claro);
   - alerta `base_antiga_pausada` na tabela de alertas e e-mail para lucas@dompa.com.br pela exceção interna
     (tag `monitor`), com os números do dia e a lista dos endereços devolvidos;
   - a volta é manual: só com o seu "sim", a chave volta para false.

6. Teste de ponta a ponta antes de ligar: envio para um endereço inexistente em domínio real (ex.: `nao-existe-xyz@gmail.com`)
   a partir da `email-teste`, para ver a devolução chegar, bloquear e aparecer no lead. Sem lead real envolvido.

## O que preciso confirmar no Resend (passo seu ou acesso de leitura para mim)

No painel do Resend, em Webhooks, o endpoint `…/functions/v1/circular-webhook` precisa estar assinado para
`email.delivered`, `email.bounced`, `email.complained`, `email.opened` e `email.clicked`, no domínio envio.konioca.com.
Se hoje só a Circular estiver recebendo eventos, é porque o endpoint está filtrado. Sem isso, nada do plano funciona.

## Entregáveis

- Migração 690: tabela `emails_bloqueados`, colunas no lead, chaves `base_antiga_pausada`, `base_antiga_devolucao_minimo` (20),
  `base_antiga_devolucao_max_pct` (3), função `email_bloquear(endereco, motivo, mensagem_id)` e `lead_email_corrigir(lead, novo)`.
- `_shared/email_eventos.ts` (regra pura) com testes: classificação do evento, decisão de bloqueio, cálculo da taxa do dia.
- `circular-webhook` v2, `_shared/email.ts` e `_shared/circular.ts` com a verificação de bloqueio, `fila-processar` e
  `base-antiga-processar` respeitando a pausa.
- Docs 11 e 14 atualizados (regra de bloqueio e ação do painel).

Nada disso é publicado antes do seu "sim". Depois do "sim": migração, functions, teste do item 6 e relatório.
