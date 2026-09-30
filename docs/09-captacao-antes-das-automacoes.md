# Captação aberta antes das automações (30/09)

Decisão do Lucas: abrir a captação já, só para guardar a base. WhatsApp e e-mail automáticos entram depois.

## O que está no ar

- LP em `prevenda.konioca.com` com os textos de pré-reserva (R$ 1.000 de acesso à pré-reserva, que já contam no valor da máquina; mais a entrada na assinatura; "Pago até a assinatura" calculado como `reserva_valor + entrada_valor`).
- Página de obrigado com "Falar com o time no WhatsApp" (`config.whatsapp_time_link`, número (11) 91945-1047), data da live e botão de agenda.
- Política de privacidade em `/privacidade` (rascunho; jurídico revisa). Encarregado e retenção preenchidos em 30/09.
- Links com UTM em `docs/08-links-utm.md`.

## Planilha do time

Function `leads-planilha` devolve CSV (Data, Nome, WhatsApp, E-mail, Cidade, Tem negócio, Origem, Canal UTM), mais novo primeiro, sem quem pediu para sair. Protegida por chave: a config guarda só o SHA-256 (`planilha_token_hash`); a chave em si fica apenas na fórmula da planilha.

1. No Google Drive, criar uma planilha em branco (só o time com acesso; nunca "qualquer pessoa com o link").
2. Na célula A1: `=IMPORTDATA("https://ytsildpxummevfkjcjhs.supabase.co/functions/v1/leads-planilha?k=<CHAVE>")`.
3. O Google atualiza sozinho, em geral a cada hora. Não editar as colunas importadas; anotações do time vão em colunas à direita ou em outra aba.

Trocar a chave (alguém saiu do time, link vazou): gerar uma nova, gravar o SHA-256 em `planilha_token_hash` e atualizar a fórmula. A chave antiga para na hora.

## Nada se perde enquanto os canais estão desligados

- Convite por WhatsApp: entra na fila no cadastro e espera. Sem WABA configurada ou com configuração entre colchetes, o item volta para a fila sem gastar tentativa (antes, configuração pendente descartava o item depois de 30 tentativas; corrigido).
- Circular: o cron `circular-pendentes` (a cada 10 min, 50 por vez) envia a quem ainda não recebeu assim que PDF, Resend e remetente estiverem prontos. Sem isso, para no primeiro e não gasta nada. Quem falha 3 vezes no provedor sai da repetição automática.
- Grupo de controle (10%, `grupo_controle_pct`): por desenho não recebe convite automático. Recebe a Circular normalmente.
- Rotinas agendadas: até 30/09 todas voltavam 401 porque a checagem da chave comparava com a chave nova injetada no runtime. `exigirServico` agora valida a chave legada do Vault no próprio PostgREST.

## Antes de ligar os canais

O grupo da pré-venda saiu do obrigado. Ainda falam de grupo: o modelo `konioca_convite_live` (botão "Entrar no grupo"), o convite por e-mail, o e-mail da Circular e a página de confirmação da Circular. Decidir se o grupo volta; se não, trocar esses textos antes de submeter os modelos à Meta.
