# Devoluções e spam em qualquer e-mail (1/10, aprovado e publicado)

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
   - `email.complained` (marcou como spam): status `spam`; endereço bloqueado; evento `email_spam` no lead; e o lead
     sai de tudo, igual ao opt-out (optout_em, motivo "spam", fila cancelada em e-mail e WhatsApp). Decisão do Lucas, 1/10.
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

## Resend

Até 1/10 não havia webhook cadastrado no Resend: nenhuma devolução chegava, nem da Circular. Em 1/10 o Lucas
cadastrou o endpoint `https://ytsildpxummevfkjcjhs.supabase.co/functions/v1/circular-webhook` com `email.delivered`,
`email.bounced` e `email.complained`, e salvou `RESEND_WEBHOOK_SECRET` nos segredos das functions. Primeiro evento
`delivered` recebido às 14h08 (mensagem de teste 14, status "entregue" 5 s depois do envio).

## Entregáveis

- Migração 690: tabela `emails_bloqueados`, colunas no lead, chaves `base_antiga_pausada`, `base_antiga_devolucao_minimo` (20),
  `base_antiga_devolucao_max_pct` (3), função `email_bloquear(endereco, motivo, mensagem_id)` e `lead_email_corrigir(lead, novo)`.
- `_shared/email_eventos.ts` (regra pura) com testes: classificação do evento, decisão de bloqueio, cálculo da taxa do dia.
- `circular-webhook` v2, `_shared/email.ts` e `_shared/circular.ts` com a verificação de bloqueio, `fila-processar` e
  `base-antiga-processar` respeitando a pausa.
- Docs 11 e 14 atualizados (regra de bloqueio e ação do painel).

Publicado em 1/10 com o "sim" do Lucas: migração 690, `_shared/email_eventos.ts` e `_shared/bloqueio.ts`, webhook,
`email.ts`, `circular.ts`, `fila-processar`, `base-antiga-processar`, testes em `tests/email_eventos.test.mjs`.

## Ajustes de 2/10 (P2)

- 9h04: a trilha pausou sozinha (3 devoluções definitivas em 93 e-mails, 3,23%, teto 3%). O Lucas religou às 10h10 com
  teto de 5% só na sexta; no sábado 3/10 o teto volta a 3% (lembrete armado). Acima do teto, pausa de novo e espera segunda.
- Spam com tolerância zero: qualquer marcação de spam em e-mail da base antiga pausa a trilha na hora (circular-webhook,
  função `pausarBaseAntiga`, mesma usada pelas devoluções), com alerta e e-mail ao aprovador principal.
- Checagem dos e-mails da base antes do P3/P4 (ordem do Lucas): sintaxe (regex, 0 inválidos em 810) e domínio (MX ou A
  por DNS sobre HTTPS, 37 domínios). Saíram 8 contatos (4 P2, 1 P3, 3 P4) com status `ignorado` e o motivo em `erro`:
  domínios inexistentes (gmail.comj, gmail.con, gluiz.com), sem MX (psrcorretora.com.br, hormail.com) e erros evidentes de
  digitação que caem em domínios de terceiros (icloud.cm, iutlook.com, gamil.com). Função `base_antiga_ignorar_dominios`.
- 10h30, ordem do Lucas: os 5 erros de digitação evidentes voltam à lista com o e-mail corrigido (gmail.comj e gmail.con ->
  gmail.com, icloud.cm -> icloud.com, iutlook.com -> outlook.com; 3 P2 e 1 P4), com a correção registrada em `observacoes`
  (função `base_antiga_corrigir_dominios_v2`). O quinto (gamil.com, P2) ficou ignorado como duplicado: o endereço corrigido
  já estava na lista em outro contato. Os 3 sem domínio válido seguem ignorados. Saldo da checagem: 4 contatos fora da lista.
- 10h30, SIM do Lucas: `lead-intake` v11 e `circular-enviar` v11 publicados com o e-mail da Circular falando dos encontros
  no Meet (sem a linha da live). A Circular segue sem sair: `circular_storage_path` continua pendente (sem PDF do jurídico)
  e `circular_envios` está vazia; ela só sai depois do PDF final e do SIM dele.
- Migração 810 (marca do sorteio A/B em `base_antiga_promover_ab` passa a `now()`): SIM para aplicar só depois que a
  segunda onda das 15h terminar de sair (o lembrete das 15h cuida disso).
- P3/P4 de segunda 5/10: teto de devolução 5% (o lembrete de segunda 7h30 faz o upsert, já que o de sábado devolve a 3%)
  e spam em tolerância zero. O disparo em si depende do SIM dele no dia.
- 16h00 (o lembrete das 15h chegou com 1h de atraso): relatório A/B da primeira onda (A: 161 entregues, 5 devoluções
  definitivas, 2 cadastros pela página; B: 163 entregues, 1 definitiva, 1 cadastro; cliques não chegam como evento do
  provedor, 0 opt-out, 0 spam). Vencedora A pela regra (mais cadastros). Segunda onda: 351 P2 na fila com a A; os 20
  primeiros saíram antes da marcação da variante (bug de relógio) e levaram `utm_content=p2` em vez de `p2_a`. Função
  auxiliar `p2_variante_unica(text)` marcou os 331 restantes.
- 16h30: segunda onda concluída (333 entregues, 7 devolvidas, 11 ainda "enviado"); devolução do dia 3,00% (21 em 699),
  trilha ativa. Migração 810 aplicada em produção com o SIM do Lucas (marca do sorteio passa a `now()`) e registrada em
  `schema_migrations`.
- Ferramenta: `execute_sql` também trava em `DROP FUNCTION` (como em UPDATE puro); para mudar o tipo de retorno de uma
  função, criar com outro nome (`_v2`).
