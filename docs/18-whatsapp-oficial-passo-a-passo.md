# WhatsApp oficial (Cloud API da Meta) · o que não depende da verificação e o passo a passo para o Matheus

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

## 2. Passo a passo para o Matheus (opção B, app próprio; a opção A troca o passo 3 pelo fluxo do parceiro)

Precisa: acesso de administrador ao Portfólio empresarial da Konioca no Meta Business Suite, um e-mail para a conta
de desenvolvedor e o número que vai ficar na API com o celular por perto (SMS ou ligação).

1. Conta de desenvolvedor. developers.facebook.com, entrar com o perfil pessoal que administra a Konioca no Business
   Suite, aceitar os termos. Nada de conta nova de Facebook: usa a que já é administradora.
2. Criar o app. "Meus apps" > "Criar app" > caso de uso "Outro" > tipo "Empresa" (Business). Nome: "Konioca
   Pré-venda". Portfólio empresarial: escolher o da KONIOCA FRANQUIAS E EQUIPAMENTOS LTDA. Criar.
3. Adicionar o WhatsApp ao app. No painel do app, "Adicionar produto" > WhatsApp > "Configurar". A Meta cria uma conta
   do WhatsApp Business (WABA) ligada ao portfólio. Na tela "Configuração da API":
   - "Adicionar número de telefone": nome de exibição "Konioca", categoria, descrição, e o número. Confirmar por SMS
     ou ligação. Importante: o número não pode estar ativo no app do celular (opção B usa número novo; opção A, o
     app mostra o botão de conectar e o Matheus segue o parceiro escolhido).
   - Anotar, nessa mesma tela, o "ID do número de telefone" e o "ID da conta do WhatsApp Business". São o
     `WHATSAPP_PHONE_NUMBER_ID` e o WABA ID.
4. Chave permanente (token). O token da tela de configuração dura 24 h; não serve. Fazer:
   business.facebook.com > Configurações da empresa > Usuários > Usuários do sistema > "Adicionar" > nome "konioca-api",
   função Administrador. Depois "Adicionar ativos" > Apps > marcar o app "Konioca Pré-venda" com controle total; e
   Contas do WhatsApp > marcar a WABA. "Gerar novo token" > escolher o app > validade "nunca expira" > permissões
   `whatsapp_business_messaging` e `whatsapp_business_management`. Copiar o token na hora (não aparece de novo).
   Esse é o `WHATSAPP_TOKEN`.
5. Segredo do app. No painel do app > Configurações do app > Básico > "Chave secreta do app" > Mostrar. É o
   `WHATSAPP_APP_SECRET` (o webhook confere a assinatura das mensagens com ele).
6. Webhook. No app > WhatsApp > Configuração > Webhook > "Editar": URL de callback
   `https://ytsildpxummevfkjcjhs.supabase.co/functions/v1/whatsapp-webhook`, token de verificação: uma frase longa
   inventada na hora (é o `WHATSAPP_VERIFY_TOKEN`; o Lucas salva no Supabase antes de clicar em "Verificar e salvar").
   Depois, em "Campos do webhook", assinar `messages`.
7. Guardar os quatro segredos. Mandar ao Lucas por canal seguro (nunca por e-mail aberto, nunca no chat deste
   projeto): `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`. O Lucas
   salva nos segredos das functions do Supabase. Com os quatro no lugar a fila passa a enviar (os itens parados com
   "WhatsApp ainda não configurado" saem sozinhos); a base antiga continua travada por `base_antiga_whatsapp_ativo`.
8. Modelos de mensagem. business.facebook.com > WhatsApp Manager > Ferramentas da conta > Modelos de mensagem >
   "Criar modelo". Para cada um: categoria, idioma Português (BR), nome exatamente como está na config, corpo com as
   variáveis na ordem, botões. Textos em docs/15. Um por vez; a Meta responde de minutos a 24 h.

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
   sem "clique aqui" solto; a categoria Marketing para tudo que convida ou oferece, Utilidade só para lembrete de
   algo que a pessoa já pediu.
9. Depois da aprovação, avisar o Lucas com o nome de cada modelo aprovado. No banco: `wa_tpl_*` já apontam para esses
   nomes; `wa_tpl_reaquecimento_manual_aprovado` vira true só com o modelo aprovado.

## O que fica para depois da verificação

Nome de exibição aprovado, limite de 1.000 conversas por dia (sobe sozinho com qualidade), selo. Até lá dá para
testar com o próprio time: a Meta libera até 5 números de teste por app.
