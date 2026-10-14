# Pausa da campanha da pré-venda (Lucas, 14/10, 16h30)

Decisão do Lucas em 14/10: interromper a campanha por um período. Nada é apagado. Este documento diz o que ficou
desligado, onde cada coisa está registrada e o que precisa ser religado na retomada, na ordem.

## O que ficou desligado (feito em 14/10)

| Peça | Como foi desligada | Onde conferir |
|---|---|---|
| Chave mestra de envios | `config.envios_ativos = false` (nenhum e-mail, WhatsApp, Circular ou item da fila sai; só avisos internos do painel passam) | `public.config` |
| Trilha da base antiga e segundo e-mail | `config.base_antiga_pausada = true`; os 690 itens `base_antiga_email2` ficam pendentes na fila sem gastar tentativa | `public.fila_envios` |
| Fila (convites, confirmações, lembretes de encontro, reaquecimento) | cron `fila-processar` desativado (`cron.alter_job active = false`); os itens ficam pendentes | `cron.job` |
| Secretária da Marcela | `config.secretaria_ativa = false` e cron `secretaria-marcela` desativado | idem |
| Lembrete da Circular | cron `circular-lembrete` desativado | idem |
| Seleção de perguntas, reteste de devolução do time, devolução de 429 | crons `perguntas-selecionar`, `email-time-retentar`, `fila-429-devolver` desativados | idem |
| Ritmo de e-mail | `config.email_por_minuto = 0` (já estava, pelo 429 do Resend) | `public.config` |
| Resumo diário das 18h50 e check-ins de cobrança | rotina do resumo desativada; check-in de 17h30 de 14/10 apagado; nenhuma cobrança automática ao time | rotinas da sessão dos agentes |
| Turmas | as 4 abertas (ids 1, 3, 7 e 9) passaram a `ativo = false`, com observação "fechada em 14/10: pausa da campanha"; `encontro_escolher` recusa turma inativa, então ninguém escolhe horário mesmo com link antigo | `public.encontros`, `config.encontros_fechados_pausa` |
| Página de cadastro e de obrigado | continuam no ar e recebendo cadastros; `config.campanha_pausada = true` (pública) esconde datas, "Escolher meu horário", a contagem regressiva e toda menção ao prazo da pré-venda (`prevenda_fim`: linhas ENCERRA e FALTAM, "Pré-venda até", "Depois de {fim_ddmm}", FAQ "Até quando"). Preço e {lote1} máquinas continuam. Mostra "Entre na lista e seja avisado quando a nova agenda de encontros com a Marcela abrir." | `site/index.html`, `site/obrigado.html`, `comum.js` (`modoAgenda`) |

O que continua rodando de propósito: `planilha-processar` (fila da planilha), `circular-reconciliar` (lê eventos do
Resend, não envia), `sults-export-diario` (exportação de dados, não envia) e `retencao-diaria` (LGPD: anonimiza quem
pediu para sair depois de 24 h e leads sem contato há 730 dias; não apaga leads ativos). O cadastro na LP segue
gravando o lead, mandando a linha para a planilha e enfileirando o convite, que fica pendente até a retomada.

A chave `envios_ativos` tem uma exceção: avisos internos do painel (tags `painel`, `monitor`, `teste`) para endereços
de `painel_aprovadores`. Nada vai para lead.

## Aviso de adiamento: à mão, pelo WhatsApp

O aviso a quem escolheu horário NÃO sai pelo sistema (decisão do Lucas, 14/10). A aba Turmas do painel mostra a lista
(nome, WhatsApp com link do wa.me, turma escolhida), turma mais próxima primeiro, e o botão "Avisado" registra quem
já recebeu a mensagem (`leads.adiamento_avisado_em` e `_por`, mais `lead_eventos` tipo `adiamento_avisado`). Quem
tem a permissão "contato" (principal, conteúdo, operacional, growth) marca; os demais só veem.

## Retomada: o que religar, nesta ordem

1. Decidir a agenda nova: criar turmas pelo painel (ou reabrir as de `config.encontros_fechados_pausa`) com link do Meet.
2. Conferir `config.prevenda_fim` (a nova data volta junto com a agenda) e então `config.campanha_pausada = false`: a LP e a página de obrigado voltam a mostrar datas, contagem regressiva, prazo e "Escolher meu horário" em até 20 s (cache da `public-config`).
3. Quem já tinha horário (6 pessoas em 14/10) precisa escolher de novo: o `encontro_id` antigo aponta para turma fechada. Decidir se recebem convite novo (`convite_enfileirar`) ou contato à mão.
4. Resolver a conta do Resend (429 desde 13/10) e publicar `fila-processar`, `email-teste` e `painel-avisar` com o código de main (ritmo e diagnóstico do 429). `config.email_por_minuto` volta a 2 ou 3.
5. Crons: `select cron.alter_job(jobid, active := true) from cron.job where jobname = any (array[...])` com a lista de `config.crons_pausados_campanha`, começando por `fila-429-devolver`, `email-time-retentar`, `fila-processar`; depois `circular-lembrete`, `secretaria-marcela`, `perguntas-selecionar`.
6. `config.secretaria_ativa = true`, `config.base_antiga_pausada = false` (se a trilha da base antiga voltar; conferir antes os 690 itens pendentes e as datas no texto do segundo e-mail, `config.base_antiga_email2_datas`), e por último `config.envios_ativos = true`, com o SIM do Lucas.
7. Religar a rotina do resumo diário (18h50) e, se o Lucas quiser, os check-ins de cobrança.
8. Smoke completo depois de cada publicação (`select public.smoke_completo()`).

Tudo o que a pausa mudou está em `config` (`campanha_pausada`, `campanha_pausada_em`, `encontros_fechados_pausa`,
`crons_pausados_campanha`, `base_antiga_pausada_motivo`), em `encontros.observacao` e neste documento.
