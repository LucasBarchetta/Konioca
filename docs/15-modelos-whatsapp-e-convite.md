# Convite, confirmação e lembretes do encontro · textos para aprovação (2/10)

Formato decidido em 2/10: no lugar da live no Instagram, a Marcela apresenta a nova geração em encontros fechados
pelo Google Meet, de 30 minutos, com no máximo 35 pessoas por grupo, a partir das 18h30 (grade 18h30 e 19h30, dias
úteis de 15/10 a 30/10). Só quem está na lista participa. Nos textos, a reserva aparece assim: "No fim do encontro, a
Marcela explica como garantir uma das 250 máquinas da pré-venda." A regra dos 10 dias da Circular fica só no roteiro.
Duração, capacidade e número de máquinas vêm da config e nunca ficam fixos no texto. Os modelos de WhatsApp estão em
docs/06. Nada abaixo está publicado: o código do branch espera o "sim" do Lucas (migração 800 e deploy das functions).

## Convite por e-mail (quem se cadastrou na página)

Gatilho: cadastro novo na página (um item por canal, docs/14). A base antiga importada não recebe este convite.
Assunto mantido: "{Nome}, seu acesso à pré-venda está garantido!". Remetente: "Time da Konioca" (`email_from`).
Pré-visualização: "A pré-venda das 250 máquinas é só para quem está na lista."

    Ana, você está na lista da nova Konioca.
    A Marcela vai apresentar a nova geração em encontros fechados pelo Google Meet: 30 minutos, no máximo 35 pessoas por grupo. Só quem está na lista participa e pode reservar uma das 250 máquinas da pré-venda.
    Você já está dentro. Até o seu encontro, é por aqui que você vê primeiro os bastidores da nova máquina e as novidades da Marcela.
    Escolha o seu horário. Depois, a gente confirma por e-mail com o link do Meet e avisa na véspera e uma hora antes.
    [Botão: Escolher meu horário]  ->  https://prevenda.konioca.com/horario/?t={token}

    Time da Marcela

    Para não receber mais mensagens da pré-venda: {link de saída}

Visual igual ao aprovado em 1/10 (faixa verde com a logo, foto da máquina atual inteira, texto, botão laranja).
Sem Instagram em lugar nenhum.

## Página de horário (`/horario/?t={token}`)

Lista os horários com vaga, agrupados por dia (turma cheia some). Depois da escolha: "Ana, seu horário está
confirmado.", cartão com dia, hora, duração e link do Meet, botão "Salvar na minha agenda" (arquivo .ics) e link
"Trocar de horário". Rodapé: "Horários no fuso de Brasília. Só quem está na lista participa. No fim do encontro, a Marcela
explica como garantir uma das 250 máquinas da pré-venda." Sem token válido, a página
pede para abrir pelo link do e-mail.

## Confirmação por e-mail (sai na hora da escolha, tipo `encontro_confirmacao`)

Assunto: "{Nome}, seu horário com a Marcela: quinta, 15/10, às 18h30". Anexo `encontro-konioca.ics` (título
"Konioca · encontro com a Marcela (Google Meet)", 30 minutos, alarme uma hora antes, link do Meet no evento).

    Ana, seu encontro está confirmado: quinta, 15/10, às 18h30 (horário de Brasília), pelo Google Meet, 30 minutos.
    Entre pelo link na hora marcada. O arquivo da agenda vai anexado, e a gente lembra na véspera e uma hora antes. No fim do encontro, a Marcela explica como garantir uma das 250 máquinas da pré-venda.
    [Botão: Entrar no Meet]  ->  link da turma
    Precisa trocar de horário? [Trocar de horário]

    Time da Marcela

Se a turma ainda não tiver link do Meet, o e-mail espera na fila (volta a cada 10 minutos) até o time preencher o link
no painel. Trocar de horário cancela os lembretes antigos e manda uma confirmação nova.

## Lembrete na véspera (18h, tipo `encontro_lembrete_vespera`)

Assunto: "{Nome}, amanhã às 18h30: seu encontro com a Marcela".

    Ana, amanhã, quinta, 15/10, às 18h30, a Marcela apresenta a nova geração para a sua turma, pelo Google Meet, 30 minutos.
    O link é o mesmo da confirmação. No fim do encontro, a Marcela explica como garantir uma das 250 máquinas da pré-venda.
    [Botão: Abrir o link do Meet]
    Não vai conseguir? [Trocar de horário]

    Time da Marcela

## Lembrete de uma hora antes (tipo `encontro_lembrete_1h`, 17h30 ou 18h30 conforme a turma)

Assunto: "{Nome}, começa em 1 hora: 18h30".

    Ana, seu encontro com a Marcela começa às 18h30, pelo Google Meet.
    Entre uns minutos antes. No fim do encontro, a Marcela explica como garantir uma das 250 máquinas da pré-venda.
    [Botão: Entrar no Meet]

    Time da Marcela

Os três e-mails são isentos do limite semanal de mensagens (`msgs_tipos_isentos`), porque a pessoa pediu o horário.

## Reaquecimento de quem foi contatado à mão

Mesma regra de 1/10 (não recebe o convite padrão por WhatsApp; o e-mail segue). Texto novo em docs/06, item 6.

## Regra da Circular (para o roteiro da Marcela)

"Quem já confirmou a Circular há dez dias reserva agora, no fim do encontro. Quem se cadastrou agora recebe a
Circular por e-mail e a reserva abre dez dias depois de confirmar o recebimento." Roteiro completo em docs/19.
