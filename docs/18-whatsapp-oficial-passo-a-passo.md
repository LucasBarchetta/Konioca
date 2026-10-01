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

## 3. Passo a passo, com quem faz cada parte (decisão de 1/10: 360dialog, plano Regular, coexistência)

Papéis: Lucas contrata e paga; Marcela é a administradora do Business Manager e fica com o celular do (11) 91945-1047
(só ela faz os passos com o celular); Matheus faz o resto. Nenhuma chave passa pelo chat deste projeto.

### 3.1 Lucas: criar a conta na 360dialog e pagar

1. Abrir hub.360dialog.com e clicar em "Sign up" (criar conta). Usar um e-mail da empresa que o Lucas controle
   (sugestão: controladoria@konioca.com com o Matheus copiado, ou o seu). Confirmar o e-mail.
2. Na primeira tela do Hub, escolher o produto "WhatsApp Business API" e o plano "Regular" (€ 49 por número por
   mês, cobrança mensal, sem prazo mínimo). Dados da empresa: KONIOCA FRANQUIAS E EQUIPAMENTOS LTDA, CNPJ, endereço.
3. Cadastrar o cartão e confirmar. A cobrança é por número ativo, mês a mês; cancelar é no próprio Hub (vale até o
   fim do mês corrente).
4. Convidar o Matheus para o Hub (Configurações > Usuários > convidar, perfil de administrador) e avisar a Marcela
   de que o próximo passo precisa do celular dela.

### 3.2 Marcela: dar ao Matheus acesso de administrador no Business Manager (uma vez)

1. business.facebook.com, entrar com o perfil que administra a Konioca, escolher o portfólio KONIOCA FRANQUIAS E
   EQUIPAMENTOS LTDA.
2. Menu Configurações (engrenagem) > Usuários > Pessoas > "Adicionar pessoas". E-mail do Matheus
   (controladoria@konioca.com), acesso "Controle total" (administrador). Enviar o convite.
3. O Matheus aceita o convite pelo e-mail, com o perfil pessoal dele no Facebook. Pronto: ele passa a ver o
   portfólio, a conta do WhatsApp e os modelos.

### 3.3 Marcela, com o celular: ligar o número em coexistência (precisa do QR code)

1. No celular, atualizar o WhatsApp Business pela loja. Conferir em Configurações > Ajuda > Informações do app que
   a versão é 2.24.17 ou mais nova. Avisar quem usa o WhatsApp Web desse número que ele vai desconectar uma vez.
2. No Hub da 360dialog (o Matheus pode estar junto, no computador): "Adicionar número" > escolher a opção para
   número que já está no WhatsApp Business app (coexistência). Abre a janela de cadastro da Meta: a Marcela entra
   com o perfil dela, escolhe o portfólio da Konioca e segue até aparecer o QR code.
3. No celular: WhatsApp Business > Configurações > Ferramentas comerciais > a opção de conectar à plataforma/API
   (texto varia com a versão: "Conectar a um parceiro" ou "WhatsApp Business Platform") > ler o QR code. Aceitar o
   envio do histórico (últimos 6 meses). Não desinstalar o app depois: ele precisa ser aberto a cada 13 dias.
4. Em até 24 h o número aparece como ativo no Hub. O app continua funcionando normal no celular.

### 3.4 Matheus: chave, IDs e modelos (sem o celular)

1. No Hub > o número > "Chave de API" > gerar. Copiar na hora; ela não aparece de novo. Salvar direto no Supabase
   (ou mandar ao Lucas por canal seguro), com estes nomes exatos nos segredos das functions:

   | Segredo | Valor |
   |---|---|
   | `WHATSAPP_PROVEDOR` | `360dialog` |
   | `WHATSAPP_TOKEN` | a chave gerada no Hub (D360-API-KEY) |
   | `WHATSAPP_WEBHOOK_SEGREDO` | uma frase aleatória longa (32 caracteres ou mais), inventada na hora; protege o nosso webhook |
   | `WHATSAPP_PHONE_NUMBER_ID` | o ID do número mostrado no Hub (informativo; a 360dialog identifica o número pela chave) |

   `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN` são só do caminho direto na Meta; ficam vazios.
2. Avisar o Lucas que os segredos estão salvos. Do nosso lado, a function `whatsapp-config` confere o estado (sem
   mostrar valores) e registra o webhook na 360dialog com o segredo na URL. A partir daí a fila passa a enviar; a base
   antiga continua travada por `base_antiga_whatsapp_ativo` até o Lucas liberar.
3. Modelos de mensagem. No Hub da 360dialog > Modelos (ou no WhatsApp Manager da Meta, para a mesma conta) >
   "Criar modelo". Um por vez, categoria, idioma Português (BR), nome exatamente como na config, corpo com as
   variáveis na ordem, botões. Textos em docs/15. Resposta da Meta de minutos a 24 h.

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
4. Depois da aprovação, avisar o Lucas com o nome de cada modelo aprovado. `wa_tpl_*` já apontam para esses nomes;
   `wa_tpl_reaquecimento_manual_aprovado` vira true só com o modelo aprovado.

Ordem e prazo (meta: funcionando antes de 12/10): 3.1 e 3.2 no mesmo dia; 3.3 no dia seguinte; 3.4 logo depois,
com os modelos enviados no mesmo dia para caber a aprovação da Meta.

### Do nosso lado (feito em 1/10 no branch, aguardando o SIM do Lucas para publicar)

`_shared/whatsapp_regras.ts` (puro, testado) e `_shared/whatsapp.ts`: chave `WHATSAPP_PROVEDOR` escolhe Meta direto ou
360dialog; muda só o endereço (`waba-v2.360dialog.io/messages`) e o cabeçalho (`D360-API-KEY`); o corpo das mensagens
é o mesmo. Webhook: na 360dialog não há assinatura da Meta, então a URL registrada leva `?s=<WHATSAPP_WEBHOOK_SEGREDO>`
e a function recusa qualquer chamada sem o segredo igual. Function nova `whatsapp-config` (chave de serviço):
"estado" e "registrar_webhook". Ecos das mensagens que o time manda pelo app chegam no webhook e são ignorados.

## O que fica para depois da verificação

Nome de exibição aprovado, limite de 1.000 conversas por dia (sobe sozinho com qualidade), selo. Até lá dá para
testar com o próprio time: a Meta libera até 5 números de teste por app.
