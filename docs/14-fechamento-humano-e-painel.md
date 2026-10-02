# Mudança de escopo de 30/09: fechamento com o time humano · plano e ordem

Construído em 1/10 (migração 700, functions `painel-api` e `painel-avisar`, página `site/painel/`), na prévia para o
"sim" do Lucas antes de ir para main. Prazo da Fase A: 5/10.

## Como o painel funciona (Fase A)

- Links de acesso só por e-mail (`painel-avisar` com `link_para`), nunca pelo chat. Depois de qualquer link exposto, troca-se
  `painel_links_versao`.
- Endereço: `/painel/` no site (noindex, fora do robots). Sem login: cada aprovador de `config.painel_aprovadores`
  tem um link assinado (`?t=` derivado da chave de serviço, do e-mail e de `config.painel_links_versao`). Trocar a
  versão invalida todos os links. O link é pessoal: toda ação grava "Nome (papel)" no evento do lead.
- Um aprovador pode ter `emails_copia` (outros endereços da mesma pessoa): o token continua saindo só de `email`,
  mas avisos e link de acesso vão para todos os endereços, e qualquer um deles serve em `link_para`.
- Lista de leads reais (sem teste do Monitor), com busca e filtros: todos, pode cobrar, sem Circular, reservados,
  contatados à mão, saíram, base antiga. Em cada lead: contato, cidade, data do cadastro, estado da cobrança
  ("Circular não confirmada" em vermelho, "Faltam X dias" em cinza, "Pode cobrar desde dd/mm" em verde, regra na
  view `v_lead_cobranca`), convite, contato manual, bloqueio de e-mail, reserva.
- Ações por lead: "Reservou" só para lead com "pode cobrar" (Circular confirmada há pelo menos o prazo legal; a função
  `lead_reservar` recusa fora disso, e o botão aparece desativado com "Circular não confirmada" ou "Faltam X dias").
  Quantidade de 1 a 10 e observação; soma no placar das 250 e tira o lead das réguas, menos o lembrete da Circular), "Desfazer reserva", "Contatado à mão" (cancela o convite por WhatsApp e enfileira o
  reaquecimento), "Corrigir e-mail" (com opção de reenviar o convite), "Histórico" (eventos e mensagens).
- Aba "Aprovações": itens da tabela `aprovacoes` (texto, e-mail, peça, config) com aprovar, aprovar com edição ou
  recusar (motivo obrigatório). `painel-avisar` manda o aviso por e-mail aos aprovadores do papel, com o link de cada
  um (tag `painel`, sai pela exceção interna). Nenhum item é criado automaticamente nesta fase.
- Placar no topo: reservas do lote 1 sobre `lote1_tamanho`. O `public-config` lê o mesmo placar para a LP quando
  `contador_visivel` estiver ligado.

## Papéis e regra de aprovação (2/10 à noite, pedido do Lucas)

A regra fica em `_shared/painel_regras.ts` (`permissoesDe`, `podeAcao`, `regraAprovacao`, `revisarConteudo`); a
`painel-api` recusa com 403 o que o papel não faz e com 422 o que o revisor automático barra; a tela só esconde o botão.
Quem é quem está só em `config.painel_aprovadores` (nome, e-mail, papel, escopo).

| Papel | Vê | Faz no lead e nas turmas | Na aba Aprovações |
|---|---|---|---|
| principal (Lucas) | tudo | tudo | aprova mensagens para leads ou base, peças, propostas e config; comenta; propõe A/B |
| conteudo (Marcela) | tudo | tudo, menos gerar link | aprova o que usa voz ou imagem dela (mensagens, roteiros, peças); comenta; propõe A/B |
| operacional (Matheus, cópia marketing) | tudo | tudo, menos gerar link (turmas e links do Meet) | comenta e propõe A/B; não aprova conteúdo |
| growth (LG) | tudo: leads, turmas, Desempenho, aprovações | "Contatado à mão" e "Respondeu"; sem reserva, correção de e-mail, turmas e presença | aprova mensagens para leads ou base, roteiros de vídeo, peças e propostas; comenta; propõe A/B |

Quem decide cada item (`regraAprovacao(tipo, usa_marcela)`): basta um de `qualquer_um_de` e, além disso, cada um de `tambem`.

| Tipo | Basta um de | E também |
|---|---|---|
| e-mail, WhatsApp, texto (mensagens para leads ou base) | principal ou growth | conteudo, se usa voz ou imagem da Marcela |
| roteiro de vídeo | principal ou growth | conteudo, se ela aparece |
| peça | principal ou growth | conteudo, se usa a imagem dela |
| proposta de teste A/B | principal ou growth | conteudo, se usa a imagem dela |
| config | principal | |

Cada decisão fica em `aprovacoes_decisoes` (uma por papel por item, "Nome (papel)", hora); o item fecha como aprovado,
editado ou recusado quando a regra se cumpre ou alguém recusa (`aprovacao_registrar`, migração 820). Comentários em
`aprovacoes_comentarios`. A proposta de A/B entra pendente com a mesma regra das mensagens; o `painel-avisar` avisa
quem está na regra e ainda não decidiu. Aprovar um item no painel não dispara nada: o envio em si continua
dependendo do SIM do Lucas no chat, como toda publicação.

Revisor automático (`revisarConteudo`, roda na API antes de qualquer aprovação, para todo papel; ninguém passa por cima):
preço diferente do da página (todo "R$" precisa ser o preço da pré-venda, o atual, a diferença em mil, R$ 1.000 ou um
valor de `config.revisor_valores_permitidos`), construção "de/por", promessa de faturamento, lucro ou renda, e máquina
ou produto feito por IA (declarado no conteúdo, `maquina_ia`; ilustração de pessoa ou cenário por IA não é barrada).
Ajustes do Lucas de 3/10: o principal aprova qualquer tipo de item; trava de IA só para produto e máquina; R$ 1.000
entre os valores permitidos. O item barrado fica pendente com o motivo na tela até alguém corrigir o conteúdo.

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
| 1 | Migração 700: `reservas` (uma linha por máquina, numerada), `lead_reservar`, `lead_reserva_cancelar`, `v_lead_cobranca`, `v_painel_leads`, fila ignorando reservados | feito em 1/10 | |
| 2 | Painel (Fase A): lista de leads com data da Circular, "pode cobrar", botão "Reservou" com quantidade | feito em 1/10, na prévia | item 1 |
| 3 | Revisor e e-mail do painel (Fase A): tabela `aprovacoes`, aba no painel, `painel-avisar` | feito em 1/10, na prévia | aprovadores na config |
| 4 | Contador das 250 na LP ligado ao placar real (`contador_visivel`) | quando você mandar ligar | item 1 |
| 5 | Régua de pós-venda | depois da live, com o texto aprovado | itens 1 e 2 |

## Regra do convite com o link da live (e-mail E WhatsApp)

Config (migração 650, aplicada em 1/10): `convite_canais = ["email", "whatsapp"]` e `convite_whatsapp_ate = 12/10 23h59`.
Migração 660 (aguarda o "sim"): a fila cria um item por canal para cada lead novo (`convite_enfileirar`), a
deduplicação passa a ser por lead, tipo e canal, e quem já está na lista com convite só por WhatsApp ganha o item
de e-mail. O e-mail sai assim que `envios_ativos` for ligado. O item de WhatsApp espera o número oficial; se em
12/10 o WhatsApp oficial ainda não estiver ativo, a fila-processar cancela os itens de WhatsApp do convite com motivo
"whatsapp_nao_aprovado_ate_2026-10-12" e o e-mail sozinho dá conta. Com o WhatsApp ativo antes da data, os dois
canais saem, como o Lucas decidiu. Marcação "contatado à mão no WhatsApp" (`lead_contato_manual`): grava data e quem
marcou, cancela o convite por WhatsApp pendente daquele lead com motivo `contato_manual` e deixa o e-mail seguir; botão
no painel da Fase A. Prévia de e-mail para aprovador: function `email-teste` (chave de serviço), tag `teste` na exceção
interna, só para endereços de `painel_aprovadores`.

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

## Etiqueta de canal (1/10)

Cada lead mostra, ao lado do nome, o canal de origem pelo primeiro toque, com a mesma regra da aba Desempenho (`origem_numeros` sobre os UTMs guardados no cadastro, coluna `canal` da view `v_painel_leads`): Stories, Bio do Instagram, Bio do TikTok, WhatsApp, E-mail base antiga P1/P2/P3-P4, Convite, Direto, Outros. Tocar na etiqueta mostra o link específico (`utm_content`, ex.: o roteiro de vídeo) e os UTMs crus. No topo da lista há um filtro por canal, com a contagem de cada um dentro do filtro atual. Migração `20261001000750_painel_canal.sql` (só leitura, aplicada junto com a publicação do painel).

## Temperatura do lead (1/10)

Regra simples no banco (`lead_temperatura`, migração 760), calculada na leitura e por isso recalculada a cada atualização do painel e da planilha. Quente: clicou para falar no WhatsApp do time, foi marcado como "respondeu" pelo time, confirmou a Circular ou clicou num e-mail nosso depois do cadastro (sinal nos últimos 14 dias). Morno: cadastrou pela página há até 14 dias sem sinal quente (agenda salva não conta), ou contato da base antiga que clicou no e-mail. Frio: base antiga sem clique, cadastro sem nenhuma ação há mais de 14 dias, ou quem saiu. "Tem negócio" não muda a temperatura: só ordena dentro de cada grupo. No painel: etiqueta ao lado do canal, filtro Quente/Morno/Frio, quentes primeiro na lista, e o botão "Respondeu" (evento `respondeu`, só registro, nada é enviado). Na aba Total da planilha: coluna "Temperatura". O agente de funil refina depois.

## Contagem regressiva da atualização (1/10)

No lugar de "atualizado há X s", o painel mostra "próxima atualização em X s", descendo até zero e reiniciando a cada atualização (30 s). Com a página escondida o relógio para e a contagem congela; ao voltar, atualiza na hora e reinicia. Se a atualização estiver esperando um formulário aberto ou alguém digitando, aparece "atualiza quando você terminar". Sem conexão: "sem conexão, tentando de novo em 30 s".

## Turmas (aba do painel, 2/10)

Formato de 2/10: encontros fechados no Google Meet no lugar da live. Aba "Turmas" no painel, para os três aprovadores.

- Cadastro e edição de turma: data e hora (horário de Brasília), minutos (padrão 30), vagas (padrão 35), link do
  Meet, ativa ou não. Função `encontro_salvar`. Turma com inscritos não pode ser desativada nem ter vagas abaixo do
  número de inscritos. Mudar a hora reagenda os lembretes de quem já escolheu.
- Sem link do Meet, a confirmação por e-mail espera na fila e a etiqueta "Sem link do Meet" fica vermelha no cartão.
- Lista da turma: nome, WhatsApp, cidade, situação da Circular (Pode cobrar, Circular ok com prazo correndo, Circular
  não confirmada), reserva, e os botões Presente e Faltou (função `encontro_presenca`, grava quem marcou).
- Filtros Próximas, Passadas e Todas. Resumo: turmas, inscritos e vagas.
- Cartão do lead na aba Leads: etiqueta "Turma qui 15/10 10h" (dourada), "· presente" (verde) ou "· faltou"
  (vermelha). Sem escolha: nada aparece. A view `v_painel_leads` traz `encontro_id`, `encontro_inicio`,
  `encontro_presenca` e `encontro_escolhido_em`.
- Agenda inicial (migração 800, só se a tabela estiver vazia): dias úteis de 15/10 a 30/10, 18h30 e 19h30, 35 vagas,
  sem link do Meet (o Matheus preenche no painel). Abertas no início só 15/10, 16/10, 20/10 e 21/10 às 18h30; as
  demais ficam cadastradas e fechadas. Acima de 25 inscritos (`encontro_aviso_inscritos`), o aprovador principal
  recebe e-mail e a turma ganha a etiqueta "Acima de 25: abrir a próxima"; abrir a das 19h30 é manual, no painel. Quem está na lista escolhe em `/horario/?t={token}`; turma cheia some;
  só turmas que começam daqui a mais de 30 minutos aparecem.
- Function pública `encontro-escolher` (listar, escolher; limite de 60 chamadas por IP a cada 10 minutos) e
  `encontro-ics` (arquivo da agenda do lead). Evento `clicou_horario` registra o clique no botão da página de obrigado.
