# Modelos de mensagem do WhatsApp para submeter à Meta (formato de 2/10: encontros no Google Meet)

Submeter em WhatsApp Manager > Modelos de mensagem, idioma Português (BR), assim que o número oficial estiver ativo
(docs/18). Os nomes precisam ser exatamente estes, porque o sistema os lê da configuração (`wa_tpl_*`). Nenhum
modelo fala de Instagram nem de live: a apresentação da Marcela acontece em encontros fechados pelo Google Meet,
de 30 minutos, com no máximo 35 pessoas por grupo, em horários que a pessoa escolhe depois do cadastro. A duração e a
capacidade vêm da config (`encontro_duracao_min`, `encontro_capacidade`) e entram como variáveis, nunca fixas no texto.

Regras de voz: todo modelo abre com "Oi, {{1}}," e termina com texto fixo (nada de variável no início ou no fim, para
a Meta não recusar); uma pergunta por mensagem; sem exclamação; assinatura do Time da Marcela; nenhuma exclusividade
falsa. As exclusividades citadas são as reais: lista, encontros fechados, 250 máquinas e prazo. Não existe lote extra.
Nenhum modelo fala em reservar ou pagar no encontro. A regra dos 10 dias da Circular fica só no roteiro do encontro
(docs/19), por decisão do Lucas em 2/10: nos textos, "no fim do encontro, a Marcela explica como garantir uma das máquinas".

Categoria: a Meta decide a final. Convites são Marketing. Confirmação e lembretes do encontro e lembrete da Circular
foram escritos como Utilidade, sem chamada de venda. Se a Meta reclassificar para Marketing, nada muda no código.

A ordem das variáveis é a que o código manda (`_shared/fila.ts`). Status: nada publicado; nenhum item de WhatsApp sai
enquanto o número oficial não estiver ativo e os modelos aprovados.

## 1. `konioca_convite_encontro` · Marketing (config `wa_tpl_convite`)

Sai para quem se cadastrou na página (um item por canal, docs/14). Variáveis: {{1}} nome, {{2}} minutos,
{{3}} pessoas por grupo, {{4}} máquinas.
```
Oi, {{1}}, seu nome está na lista da pré-venda da nova Konioca.
A Marcela vai apresentar a nova geração em encontros fechados pelo Google Meet: {{2}} minutos, no máximo {{3}} pessoas por grupo. Só quem está na lista participa e pode reservar uma das {{4}} máquinas da pré-venda.
Escolha o seu horário pelo botão. A gente confirma por aqui e por e-mail, com o link do Meet.
```
Exemplos: `Ana` · `30` · `35` · `250`

Rodapé: `Time da Marcela · responda Sair para não receber mais`

Botões:
1. URL dinâmica, texto `Escolher meu horário`, URL `https://prevenda.konioca.com/horario/?t={{1}}` (o código manda o
   token do lead como sufixo; exemplo para a Meta: `exemplo`)
2. Resposta rápida `Sair`

## 2. `konioca_encontro_confirmacao` · Utilidade (config `wa_tpl_encontro_confirmacao`)

Sai na hora em que a pessoa escolhe (ou troca) o horário. Variáveis: {{1}} nome, {{2}} dia e hora por extenso.
```
Oi, {{1}}, seu encontro com a Marcela está confirmado: {{2}}, pelo Google Meet. O link está no botão e no seu e-mail, junto com o arquivo da agenda.
Entre uns minutos antes. Se precisar trocar de horário, use o link do e-mail.
```
Exemplos: `Ana` · `quinta, 15/10, às 10h`

Rodapé: `Time da Marcela`

Botão: URL dinâmica, texto `Entrar no Meet`, URL `https://meet.google.com/{{1}}` (o código manda o código da sala,
exemplo `abc-defg-hij`).

## 3. `konioca_encontro_lembrete` · Utilidade (config `wa_tpl_encontro_lembrete`)

Mesmo modelo para a véspera (às 18h, `encontro_lembrete_vespera_hora`) e para uma hora antes (17h30 ou 18h30, conforme a turma). Variáveis: {{1}} nome,
{{2}} hora.
```
Oi, {{1}}, lembrete do seu encontro com a Marcela, pelo Google Meet, às {{2}}. O link está no botão.
Entre uns minutos antes. No fim, a Marcela explica como garantir uma das máquinas da pré-venda.
```
Exemplos: `Ana` · `10h`

Rodapé: `Time da Marcela`

Botão: URL dinâmica, texto `Entrar no Meet`, URL `https://meet.google.com/{{1}}`.

## 4. `konioca_circular_lembrete` · Utilidade (config `wa_tpl_circular_lembrete`)

Sem mudança.
```
Oi, {{1}}, falta um clique para confirmar que você recebeu a Circular de Oferta de Franquia. O prazo da lei só começa a contar depois disso. Quem confirma até {{2}} ainda garante a pré-reserva: {{3}}
```
Exemplos: `Ana` · `20/10` · `https://ytsildpxummevfkjcjhs.supabase.co/functions/v1/circular-confirmar?t=exemplo`

Rodapé: `Time da Marcela`

## 5. `konioca_base_antiga` · Marketing (config `wa_tpl_base_antiga`)

Base antiga ainda não está na lista, então o botão leva à LP (cadastro, aceite e Circular). Variáveis: {{1}} nome,
{{2}} "em fevereiro" (ou "antes"), {{3}} minutos, {{4}} pessoas por grupo. Sem data: a pessoa escolhe o horário
depois do cadastro. Trilha pausada (cron `base-antiga-processar` parado) até o número oficial existir.
```
Oi, {{1}}, você procurou a Konioca {{2}}. A gente refez a máquina, e a Marcela mostra a nova geração em encontros fechados pelo Google Meet: {{3}} minutos, no máximo {{4}} pessoas por grupo, só para quem está na lista. Quer entrar na lista?
```
Exemplos: `Ana` · `em fevereiro` · `30` · `35`

Rodapé: `Time da Marcela · responda Sair para não receber mais`

Botões:
1. URL fixa, texto `Quero entrar na lista`, URL `https://prevenda.konioca.com/?utm_source=base&utm_medium=whatsapp&utm_campaign=base_antiga`
2. Resposta rápida `Sair`

## 6. `konioca_reaquecimento_manual` · Marketing (config `wa_tpl_reaquecimento_manual`)

Para quem o time já chamou à mão no WhatsApp (botão "contatado à mão" no painel). Uma vez, só com o nome. Só sai com
`wa_tpl_reaquecimento_manual_aprovado = true`.
```
Oi, {{1}}, aqui é do time da Marcela, da Konioca. A gente ficou muito feliz com o seu interesse na nova máquina. Você foi uma das primeiras pessoas a entrar na lista. A Marcela vai mostrar a nova geração em encontros fechados pelo Google Meet, com as condições da pré-venda das 250 unidades. Quer escolher o seu horário?
```
Exemplo: `Ana`

Rodapé: `Time da Marcela`

Botão: URL dinâmica, texto `Escolher meu horário`, URL `https://prevenda.konioca.com/horario/?t={{1}}`.

## Fora de uso desde 2/10

`konioca_convite_live_ig`, `konioca_lembrete_live`, `konioca_lembrete_live_pergunta`, `konioca_gravacao` e
`konioca_pos_live` não devem ser submetidos. Os tipos `lembrete_live`, `lembrete_live_pergunta` e `gravacao` continuam
no código por compatibilidade com itens antigos da fila, mas o cron `live-disparos` foi removido (migração 800) e nada
mais os enfileira. Se um dia houver gravação dos encontros, escrever um modelo novo e aprovar o texto antes.
