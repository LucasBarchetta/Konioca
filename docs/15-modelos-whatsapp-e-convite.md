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
    A Marcela apresenta a nova geração ao vivo no Instagram da Konioca: {{2}}, {{3}}, às {{4}}. A live é aberta, mas só quem está na lista pode reservar uma das {{5}} máquinas.
    Siga o perfil e ative o lembrete. Uma hora antes a gente avisa por aqui. Você consegue estar lá?
    [Botão de URL: Seguir o Instagram]   [Resposta rápida: Sair]

E-mail do convite (texto consolidado de 1/10). Assunto: "Você está na lista da nova Konioca". Pré-visualização:
"A pré-venda das 250 máquinas é só para quem está na lista." A data e a hora vêm da config.

    Ana, você está na lista da nova Konioca.
    No dia 15/10, às 19h, a Marcela apresenta a nova geração ao vivo no Instagram. A live é aberta, e muita gente vai assistir. Mas só quem está na lista pode reservar uma das 250 máquinas da pré-venda.
    Você já está dentro. Até a live, é por aqui que você vê primeiro os bastidores da nova máquina e as novidades da Marcela.
    [Botão: Seguir o Instagram da Konioca]
    Uma hora antes, a gente avisa por aqui e no seu WhatsApp. Você consegue estar lá?

    Time da Marcela

    Para não receber mais mensagens da pré-venda: {link de saída}

Na versão em HTML o link do perfil é o botão "Seguir o Instagram da Konioca". Visual (1/10): faixa verde no topo
com a logo centralizada (180 px), foto real da máquina na largura toda (600 px, texto alternativo "Nova máquina
Konioca", JPEG de 65 KB, recorte horizontal do arquivo FOTO-HORIZONTAL-PREVIA do Drive), depois o texto. Sem emoji.
As imagens ficam hospedadas em `site/assets/img/email/` (Cloudflare Pages), base em `config.email_imagens_url`.

## Reaquecimento de quem foi contatado à mão no WhatsApp

Quem o time já chamou à mão no WhatsApp (botão "contatado à mão" no painel, ou `lead_contato_manual`) não recebe o
convite padrão por WhatsApp (item cancelado com motivo `contato_manual`). O e-mail de convite segue igual para todos.
Quando o WhatsApp oficial ligar, essa pessoa recebe o modelo abaixo, uma vez. Se o modelo não estiver aprovado na Meta
(`config.wa_tpl_reaquecimento_manual_aprovado = false`), o item fica parado na fila e nada sai sozinho.

WhatsApp, modelo `konioca_reaquecimento_manual` (categoria Marketing, pt_BR). Variável única: {{1}} primeiro nome.

    Oi, {{1}}, aqui é do time da Marcela, da Konioca. A gente ficou muito feliz com o seu interesse na nova máquina. Você foi uma das primeiras pessoas a entrar na lista. A Marcela vai mostrar a nova geração ao vivo no Instagram, com as condições da pré-venda das 250 unidades. Quer que a gente te avise uma hora antes?

## Lembrete de uma hora antes

WhatsApp, modelo `konioca_lembrete_live` (Utility). Variáveis: {{1}} nome, {{2}} hora, {{3}} perfil do Instagram.

    Oi, {{1}}, a live da Konioca começa às {{2}}. É aberta, no Instagram da Konioca: {{3}}
    Na hora, é só abrir o perfil da Konioca.

Variante com a pergunta selecionada, modelo `konioca_lembrete_live_pergunta`. Variáveis: {{1}} nome, {{2}} hora,
{{3}} pergunta, {{4}} perfil.

    Oi, {{1}}, a live da Konioca começa às {{2}}. A Marcela separou a sua pergunta: {{3}}
    É aberta, no Instagram da Konioca: {{4}}
    Na hora, é só abrir o perfil da Konioca.

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
