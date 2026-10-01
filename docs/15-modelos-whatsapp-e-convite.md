# Modelos de WhatsApp e convite da live · textos para aprovação (1/10)

Regras aplicadas: todo modelo abre com "Oi, {{1}}," e termina com texto fixo (nada de variável no início ou no fim,
para a Meta não recusar). A ordem das variáveis é a mesma que o código manda (`_shared/fila.ts`). Nada publicado:
os modelos ainda precisam ser cadastrados e aprovados na Meta, e o e-mail só sai com `envios_ativos` ligado.

## Convite com o link da live (quem se cadastrou na página)

Vai só para quem se cadastrou na página (gatilho de cadastro novo e cadastro de quem veio da base antiga pela
página). A base antiga importada não recebe este convite: o gatilho pula `base_antiga = true`, e a trilha dela
(`base_antiga` / `base_antiga_email`) tem texto próprio, ainda a aprovar.

WhatsApp, modelo `konioca_convite_live_ig` (categoria Marketing, pt_BR). Variáveis: {{1}} nome, {{2}} dia da semana,
{{3}} dd/mm, {{4}} hora, {{5}} máquinas. Botão de URL fixa para o perfil do Instagram e botão de resposta "Sair".

    Oi, {{1}}, seu nome está na lista da pré-venda da nova Konioca.
    A Marcela apresenta a nova geração ao vivo no Instagram da Konioca: {{2}}, {{3}}, às {{4}}. A pré-venda tem {{5}} máquinas.
    Siga o perfil e ative o lembrete. Uma hora antes a gente avisa por aqui. Você consegue estar lá?
    [Botão de URL: Seguir o Instagram]   [Resposta rápida: Sair]

E-mail do convite (assunto: "Seu nome está na lista da pré-venda"):

    Ana, seu nome está na lista da pré-venda da nova Konioca.
    A Marcela apresenta a nova geração ao vivo no Instagram da Konioca: quinta, 15/10, às 19h. A pré-venda tem 250 máquinas.
    Siga o perfil e ative o lembrete: {instagram_url}
    Uma hora antes a gente avisa por aqui e no seu WhatsApp. Você consegue estar lá?

    Time da Marcela

    Para não receber mais mensagens da pré-venda: {link de saída}

Na versão em HTML o link do perfil é o botão "Seguir o Instagram da Konioca".

## Lembrete de uma hora antes

WhatsApp, modelo `konioca_lembrete_live` (Utility). Variáveis: {{1}} nome, {{2}} hora, {{3}} perfil do Instagram.

    Oi, {{1}}, a live da Konioca começa às {{2}}. É aberta, no Instagram da Konioca: {{3}}
    Às 19h é só abrir o perfil da Konioca.

Variante com a pergunta selecionada, modelo `konioca_lembrete_live_pergunta`. Variáveis: {{1}} nome, {{2}} hora,
{{3}} pergunta, {{4}} perfil.

    Oi, {{1}}, a live da Konioca começa às {{2}}. A Marcela separou a sua pergunta: {{3}}
    É aberta, no Instagram da Konioca: {{4}}
    Às 19h é só abrir o perfil da Konioca.

## Gravação (dia seguinte), para aprovar depois

Modelo `konioca_gravacao` (Marketing). Variáveis: {{1}} nome, {{2}} link da gravação. Botões de resposta:
"Quero uma", "Tenho uma dúvida", "Agora não" (a conversa automática já entende os três).

    Oi, {{1}}, a gravação da live da Konioca está no ar: {{2}}
    Se ficou alguma dúvida, responda por aqui que o Time da Marcela te atende.

## Regra da Circular

Nenhum destes textos fala em reservar ou pagar na noite da live. Quem se cadastra recebe a Circular por e-mail e só
pode fazer a pré-reserva 10 dias depois de confirmar o recebimento (`circular_prazo_dias`). A frase para o roteiro
da Marcela: "Quem se cadastrou agora recebe a Circular por e-mail e a pré-reserva abre dez dias depois de confirmar
o recebimento."
