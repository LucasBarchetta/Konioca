# Retenção, anonimização e lista de bloqueio (30/09)

Decisão do Lucas: anonimizar, não apagar. Migration `20260930000540_retencao_anonimizacao.sql`, já aplicada em produção e testada com dados fictícios (transação desfeita no fim).

## O que a rotina faz

Cron `retencao-diaria`, 03h40 de São Paulo, chama `retencao_executar()`:

| Caso | Quando | O que acontece |
|---|---|---|
| Pediu para sair | bloqueio na hora (trigger); anonimização após `retencao_optout_horas` (24) | entra na lista de bloqueio e é anonimizado |
| Sem contato | `retencao_dias` (730) depois do último contato | anonimizado, sem bloqueio |
| Tem pré-reserva | nunca pela rotina | registro de contrato fica pelo prazo legal; se pediu para sair, só bloqueia |
| Base antiga que não virou lead | 730 dias depois do último contato no Sults | anonimizada |
| `rate_limit` (guarda IP) | 2 dias | apagado |

Cada execução grava uma linha em `retencao_log` (contagens, sem dado pessoal).

Anonimizar = trocar nome por "Anonimizado", e-mail por `anon-<id>@anonimizado.invalid`, apagar WhatsApp, IP, navegador, fbclid/gclid/ttclid/fbp/fbc, referrer, página de entrada, pergunta da live, `sults_id`, e gerar token novo (links antigos morrem). Nas tabelas ligadas: corpo e bruto das mensagens, e-mail e eventos da Circular, payload da fila (pendentes viram cancelados), nome e texto das perguntas, resumo dos alertas, `dados` dos eventos, e a linha correspondente da base antiga. Fica: cidade, UF, origem, UTMs de campanha, datas, status do funil e eventos.

## Lista de bloqueio

Tabela `bloqueio_contato` (tipo, hash). Hash = HMAC-SHA256 do WhatsApp (só dígitos, com 55) e do e-mail (minúsculo, sem espaços), com chave aleatória guardada só no Vault (`bloqueio_chave`). Sem a chave, o hash não permite descobrir o número nem o e-mail. Trocar a chave invalida a lista inteira.

Onde vale, direto no banco:
- Cadastro novo de quem está na lista: entra, recebe `leads.bloqueado_em`, e todo item de fila criado para ele nasce cancelado (`motivo = bloqueio`). Na planilha, a coluna "Contato" mostra "Não contatar: pediu para sair antes".
- Base antiga: linha que bate com a lista vira `status = ignorado`, `erro = bloqueio`.
- Para uso nas functions: `contato_bloqueado(whatsapp, email)` (só service_role).

## Para a conversa dos agentes (functions)

- `sults-export` no modo agendado exporta todos os leads: filtrar `anonimizado_em is null` para não mandar linhas "Anonimizado" ao Sults. A anonimização não chega ao Sults; o registro de lá precisa de rotina própria.
- Classificação de origem (`_shared/validacao.ts`): fbclid/ttclid não significam mais tráfego pago quando o `utm_medium` é orgânico (bio, stories, post, reels, mensagem). O Instagram põe fbclid em todo clique dos stories, e 2 dos 3 primeiros cadastros tinham saído como "Tráfego pago". Os dois já foram corrigidos no banco; a `lead-intake` precisa ser republicada com o `validacao.ts` novo para os próximos.
- `leads-planilha` foi publicada por esta conversa (versão 6) com: data em texto "30/09/2026 18h49", sem anonimizados, coluna "Contato". Se ela estiver na lista de publicação dos agentes, publicar a partir deste código para não voltar atrás.
