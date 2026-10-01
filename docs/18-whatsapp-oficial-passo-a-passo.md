# WhatsApp oficial (Cloud API da Meta) · coexistência via parceiro e o passo a passo para o Matheus

Consulta de 1/10. Nada foi configurado. Verificação da empresa (KONIOCA FRANQUIAS E EQUIPAMENTOS LTDA) enviada em
1/10, prazo de cerca de 2 dias úteis. Sem a verificação o número funciona com limite baixo (250 pessoas por 24 h) e
sem nome de exibição aprovado; depois dela o limite sobe por degraus (1.000, 10.000...) conforme a qualidade.

## 1. O número (11) 91945-1047 e o app no celular

Regra da Meta: um número fica em uma plataforma só. Se o número está no WhatsApp Business do celular, ligar na API
sem perder o app só é possível pelo modo "coexistência" (número no app e na API ao mesmo tempo). Esse modo:

- exige o WhatsApp Business (app verde), não o WhatsApp comum. Se o número está no app comum, primeiro migra para o
  Business (grátis, mantém as conversas);
- é ligado de dentro do app (Configurações > Ferramentas comerciais > a opção de conectar à plataforma/parceiro) e
  passa pelo "cadastro incorporado" de um parceiro da Meta (Tech Provider ou BSP). Até onde sabemos, não dá para
  ligar coexistência direto num app próprio na Meta sem um parceiro no meio (confiança média: a Meta muda isso com
  frequência; o Matheus confirma na tela do app, passo 3 abaixo);
- o histórico recente das conversas (6 meses) sobe para a API; o app continua respondendo normal; mensagens de
  modelo saem pela API.

Sem coexistência, as alternativas são:

| Opção | O que acontece | Custo |
|---|---|---|
| A. Coexistência via parceiro (recomendada se o app precisa continuar no celular) | Mesmo número no app e na API | Meta: por mensagem de modelo (marketing cerca de US$ 0,06 por mensagem no Brasil; utilidade cerca de US$ 0,008; conversa iniciada pelo cliente e respondida em 24 h não paga). Parceiro: de grátis com margem por mensagem (Gupshup) a cerca de US$ 50 por mês por número (360dialog); Zenvia e Take Blip têm planos mensais maiores |
| B. Número novo só para a API, app próprio na Meta, sem parceiro | O (11) 91945-1047 fica no app como está; a pré-venda sai de um número novo (chip ou virtual) | Só a cobrança da Meta por mensagem; nenhuma mensalidade. Precisa de um número que receba SMS ou ligação uma vez |
| C. Mover o número para a API | O número sai do app do celular (apaga a conta no app); o atendimento humano passa a ser pela API (painel ou inbox de parceiro) | Só Meta. Perde o app; não recomendado antes da live |

Recomendação: A, se o time quer continuar atendendo pelo app do celular com o mesmo número; B, se quiser zero
dependência de parceiro e aceitar um número novo para a pré-venda. C não.

Tudo o que o código espera funciona nas três opções (a Cloud API é a mesma): segredos `WHATSAPP_TOKEN`,
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` e os modelos de mensagem.

## 2. Decisão de 1/10: coexistência via parceiro, mantendo o (11) 91945-1047

Comparação feita em 1/10 com as páginas dos parceiros e da Meta (valores podem mudar; conferir na contratação).
Meta cobra por mensagem de modelo em qualquer parceiro: no Brasil cerca de US$ 0,0625 (marketing), US$ 0,007
(utilidade), US$ 0,0225 (autenticação); resposta dentro de 24 h depois de a pessoa escrever não paga.

| | 360dialog | Gupshup | Wati | Zenvia (Brasil) |
|---|---|---|---|---|
| Coexistência hoje | Sim, documentada no fluxo de cadastro (com limites abaixo) | Sim, existe na API de parceiros ("enablement"), mas a documentação pública não diz se está aberta a cliente comum ou só a parceiros | Sim, anunciada para o inbox deles | Sim, na Zenvia Customer Cloud, com requisitos iguais aos da Meta |
| Tempo para funcionar | Mesmo dia: cadastro, pagamento, QR code no app; histórico de 6 meses sobe em até 24 h | Depende de abertura do recurso; sem prazo claro | Mesmo dia (teste grátis de 7 dias) | Dias: contrato comercial com a Zenvia antes |
| Mensalidade | € 49 (US$ 59) por número | Sem mensalidade no plano self-service | US$ 69 por mês (Growth), US$ 149 (Pro) | A partir de R$ 399 por mês |
| Custo por mensagem além da Meta | Nenhum acréscimo (modelo sem markup) | Cerca de US$ 0,001 por mensagem; mais 6% sobre marketing em alguns casos | Tabela própria da Wati, com acréscimo | Pacotes de conversa da Zenvia |
| Cancelar sem multa | Mês a mês, sem prazo mínimo; cancela e vale até o fim do mês | Mês a mês, cancela quando quiser | Sem multa, cancela quando quiser | Conferir no contrato (planos de software com termos próprios) |
| Encaixe no nosso código | Melhor: a API é espelho da Cloud API (mesmo formato de mensagem); muda só o endereço e o cabeçalho da chave | Pior: formato de API próprio; reescrever o envio e o webhook | Pior: é um inbox; a API deles é limitada no plano barato (sem webhook) e não é a Cloud API | Pior: plataforma própria; API no formato Zenvia |

Recomendação: 360dialog, plano Regular (€ 49 por número por mês), pagamento mensal, sem contrato. É o único dos
quatro que combina coexistência documentada, sem acréscimo por mensagem, cancelamento a qualquer momento e API no
mesmo formato da Meta (a adaptação no código é pequena: endereço `waba-v2.360dialog.io`, cabeçalho `D360-API-KEY`
no lugar do token da Meta, e o webhook passa a ser registrado pela API deles, com um segredo nosso na URL porque
eles não assinam a chamada como a Meta). Gupshup seria mais barato no mês, mas o recurso não está claramente aberto
a cliente comum e exigiria reescrever a integração. Wati e Zenvia vendem a plataforma de atendimento, que não
usamos.

Limites da coexistência que valem para qualquer parceiro (documentação da Meta e da 360dialog):
- WhatsApp Business (app verde) versão 2.24.17 ou mais nova, já em uso ativo no número (não serve número novo);
- o app precisa ser aberto pelo menos uma vez a cada 13 dias; desinstalar o app desconecta a API;
- 20 mensagens por segundo pela API (sobra para nós);
- no app, somem: mensagens temporárias, visualização única, localização ao vivo e listas de transmissão;
  grupos, chamadas e catálogo não passam pela API (continuam no app);
- aparelhos conectados (WhatsApp Web no computador) são desconectados na hora de ligar e precisam ser religados;
- sem selo azul (OBA) no número em coexistência; a verificação da empresa em andamento continua valendo para
  limites de envio, mas o nome de exibição não entra em revisão automática.

## 3. Passo a passo para o Matheus (coexistência via 360dialog; só depois da escolha do Lucas)

Precisa: o celular com o WhatsApp Business do (11) 91945-1047 atualizado (versão 2.24.17 ou mais nova), acesso
de administrador ao Portfólio empresarial da Konioca no Meta Business Suite, um cartão para a assinatura.

1. Atualizar o app. Na loja do celular, atualizar o WhatsApp Business. Conferir em Configurações > Ajuda que a
   versão é 2.24.17 ou mais nova. Avisar quem usa o WhatsApp Web desse número que ele vai desconectar uma vez.
2. Conta na 360dialog. hub.360dialog.com > criar conta com o e-mail controladoria@konioca.com > escolher o plano
   Regular (mensal) > pagar. Nome da empresa: KONIOCA FRANQUIAS E EQUIPAMENTOS LTDA.
3. Ligar o número com coexistência. No Hub, "Adicionar número" > escolher a opção de usar um número que já está no
   WhatsApp Business app (coexistência). Abre o cadastro da Meta: entrar com o perfil que administra a Konioca,
   escolher o Portfólio empresarial da Konioca, e seguir até o QR code. No celular: WhatsApp Business >
   Configurações > Ferramentas comerciais > a opção de conectar à plataforma/API > ler o QR code. Confirmar o
   envio do histórico (6 meses). Em até 24 h o número aparece como ativo no Hub.
4. Chave da API. No Hub > o número > "Gerar chave de API" (D360-API-KEY). Copiar na hora. É o segredo
   `WHATSAPP_TOKEN` do nosso lado (o código passa a mandar essa chave para a 360dialog em vez do token da Meta).
5. Anotar no Hub o ID do número (Phone Number ID) e o ID da conta do WhatsApp Business (WABA ID). O primeiro é o
   `WHATSAPP_PHONE_NUMBER_ID`.
6. Webhook. Não é no painel da Meta: quem registra é o nosso código pela API da 360dialog, com a URL
   `https://ytsildpxummevfkjcjhs.supabase.co/functions/v1/whatsapp-webhook` e um segredo nosso. O Matheus não precisa
   fazer nada aqui; só avisar quando a chave estiver salva.
7. Guardar os segredos. Mandar ao Lucas por canal seguro (nunca e-mail aberto, nunca o chat deste projeto):
   `WHATSAPP_TOKEN` (chave D360), `WHATSAPP_PHONE_NUMBER_ID`, WABA ID. O Lucas salva nos segredos das functions.
   `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN` deixam de ser da Meta e passam a ser um segredo nosso para o
   webhook; o Lucas gera na hora de salvar.
8. Modelos de mensagem. No Hub da 360dialog > Modelos (ou no WhatsApp Manager da Meta, que também funciona para a
   WABA ligada) > "Criar modelo". Um por vez, categoria, idioma Português (BR), nome exatamente como na config,
   corpo com as variáveis na ordem, botões. Textos em docs/15. Resposta da Meta de minutos a 24 h.

   | Nome na config | Categoria | Variáveis | Botões |
   |---|---|---|---|
   | konioca_convite_live_ig | Marketing | {{1}} nome, {{2}} dia da semana, {{3}} dd/mm, {{4}} hora, {{5}} máquinas | URL fixa (Instagram) e resposta rápida "Sair" |
   | konioca_lembrete_live | Utilidade | {{1}} nome, {{2}} hora, {{3}} link | |
   | konioca_lembrete_live_pergunta | Utilidade | {{1}} nome, {{2}} hora, {{3}} pergunta, {{4}} link | |
   | konioca_gravacao | Marketing | {{1}} nome, {{2}} link | |
   | konioca_circular_lembrete | Utilidade | {{1}} nome, {{2}} dd/mm limite, {{3}} link de confirmação | |
   | konioca_base_antiga | Marketing | {{1}} nome, {{2}} "em fevereiro" ou "antes", {{3}} dia, {{4}} dd/mm, {{5}} hora | URL fixa (LP com UTM) |
   | konioca_reaquecimento_manual | Marketing | {{1}} nome | |

   Regras que evitam recusa: nenhuma variável no início ou no fim do texto; exemplo preenchido em cada variável;
   sem "clique aqui" solto; Marketing para tudo que convida ou oferece, Utilidade só para lembrete de algo que a
   pessoa já pediu.
9. Depois da aprovação, avisar o Lucas com o nome de cada modelo aprovado. No banco, `wa_tpl_*` já apontam para
   esses nomes; `wa_tpl_reaquecimento_manual_aprovado` vira true só com o modelo aprovado.

Do nosso lado, antes do passo 4: adaptar `_shared/whatsapp.ts` (endereço e cabeçalho da 360dialog) e o webhook
(segredo na URL, sem assinatura da Meta), com testes, na prévia, para o SIM do Lucas. Meta: número ligado e pelo
menos o modelo do convite aprovado antes de 12/10.

## O que fica para depois da verificação

Nome de exibição aprovado, limite de 1.000 conversas por dia (sobe sozinho com qualidade), selo. Até lá dá para
testar com o próprio time: a Meta libera até 5 números de teste por app.
