# Política de privacidade da pré-venda · rascunho para o jurídico

Status: rascunho técnico, publicado em 30/09 por decisão do Lucas em https://prevenda.konioca.com/privacidade (`site/privacidade.html`), para abrir a captação. O jurídico revisa depois. A página pública leva só as seções para o titular; os "Pontos para o jurídico decidir" ficam só aqui. Encarregado e prazo de retenção preenchidos em 30/09.

## Controlador

Konioca Franquias e Equipamentos Ltda, CNPJ 51.071.802/0001-23. Encarregado (DPO): Controladoria da Konioca Franquias e Equipamentos Ltda., controladoria@konioca.com (definido em 30/09).

## Dados coletados e finalidade

| Dado | Onde é coletado | Para quê |
|---|---|---|
| Nome, WhatsApp, e-mail, cidade, se já tem negócio | Formulário da LP | Lista da pré-venda, convite para a live, envio da Circular de Oferta de Franquia, contato comercial |
| Data, hora, IP e navegador do aceite; texto do aceite | Formulário da LP | Prova do consentimento |
| Origem da visita (UTMs, identificadores de clique, página de entrada) | LP | Medir quais canais trazem cadastros |
| O que a pessoa pretende fazer com a máquina, pergunta para a live | Página de obrigado e WhatsApp | Preparar a live e responder no atendimento |
| Registro de mensagens trocadas, entregas e cliques | WhatsApp e e-mail | Atendimento, cumprimento do prazo legal da Circular, métricas |
| Confirmação de recebimento da Circular, com data e hora | Link no e-mail | Contar o prazo de 10 dias da Lei 13.966/2019 antes de qualquer pagamento |

## Onde os dados ficam armazenados

Os dados da pré-venda ficam armazenados nos Estados Unidos, na infraestrutura da Supabase (Amazon Web Services, região us-east-2, Ohio). Isso é uma transferência internacional de dados pessoais.

Fornecedores que tratam dados em nome da Konioca, com a localização principal do tratamento:

| Fornecedor | Função | Localização |
|---|---|---|
| Supabase (AWS) | Banco de dados, arquivos e funções | EUA (Ohio) |
| Resend | Envio de e-mails | EUA |
| Meta (WhatsApp Business, Pixel, API de Conversões) | Mensagens e medição de anúncios | EUA e outros |
| Google (Google Analytics 4, fontes) | Medição de visitas | EUA e outros |
| TikTok (Pixel) | Medição de anúncios | EUA e outros |
| Cloudflare (hospedagem da LP, Turnstile) | Hospedagem e proteção contra robôs | Rede global |
| Anthropic | Seleção de perguntas para a live e apoio ao atendimento (nome, cidade e texto da pergunta) | EUA |
| Sults | CRM da rede | Brasil |

Pontos para o jurídico decidir (INFERÊNCIA, confiança média; validar):

1. Base legal da transferência internacional (Lei 13.709/2018, art. 33). As hipóteses mais prováveis aqui são cláusulas-padrão contratuais aprovadas pela ANPD (Resolução CD/ANPD nº 19/2024) ou consentimento específico e em destaque (art. 33, VIII). Confirmar se os contratos dos fornecedores acima já incorporam as cláusulas-padrão.
2. O texto de aceite do formulário (aprovado na visualização) não menciona transferência internacional. Se a base escolhida for o consentimento, o texto do aceite precisa mudar. Se forem cláusulas-padrão, basta a política informar, com o link ao lado do aceite, como já está.
3. Base antiga (1.210 pessoas do Sults): o contato parte de relacionamento anterior, não de aceite na LP. Base legal provável: legítimo interesse (art. 7º, IX), com saída em toda mensagem e teste de balanceamento documentado. Quem se cadastra pela LP passa a ter o aceite registrado normalmente.
4. Prazo de retenção (definido em 30/09): até 2 anos após o último contato ou até o titular pedir para sair; registros ligados a contrato pelo prazo legal. Falta a rotina que apaga ou anonimiza no prazo, e decidir o que fica de quem pediu para sair (lista mínima de supressão para não contatar de novo).

## Direitos do titular

Confirmação, acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamento e revogação do consentimento (Lei 13.709/2018, art. 18). Canal: controladoria@konioca.com.

Parar de receber mensagens é imediato: link "Não quero mais receber" em todo e-mail e a palavra "Sair" no WhatsApp. As duas interrompem todas as automações na hora.

## Segurança

Acesso ao banco só pelo servidor, com chave guardada em variável de ambiente; nenhuma tabela é acessível pelo navegador. Links pessoais (confirmação da Circular, saída) usam código aleatório, não o identificador do cadastro. Formulário protegido contra robôs e contra excesso de tentativas.
