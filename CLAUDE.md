# Regras de trabalho neste repositório (Lucas, 6/10; substitui as de 1/10)

Permissões técnicas ficam em `.claude/settings.json`: tudo por regra explícita de liberação (lista `allow`), proibições na
lista `deny`. Nada pede clique. Não se usa o modo que pula todas as confirmações. O que a ferramenta não distingue vale
por conduta:

- Liberado sem pedir: deploy de function, migração no banco de produção, merge e push em main, alteração de config, envio
  pelo sistema (fila, e-mail pelo Resend, avisos do painel), triggers e check-ins.
- Proibido sempre, sem pedir e sem exceção: apagar dados em produção sem pedido do Lucas (DELETE, TRUNCATE, DROP de
  tabela com dados, apagar lead, mensagem, evento ou arquivo); ler, listar ou imprimir segredos (arquivos .env, Vault,
  segredos de functions, chaves em prints ou em logs). A única exceção de apagar é a limpeza do cadastro de teste do
  próprio smoke, marcado como teste.
- Segredos e links de acesso ao painel nunca passam pelo chat: nascem no banco ou no Supabase e vão por e-mail a um aprovador.
- Dados pessoais de leads e de terceiros nunca entram no repositório, nos prompts nem nas capturas de prévia (usar dados fictícios).
- O SIM do Lucas continua necessário só para: preço e condições comerciais, Circular e jurídico, contratações e gastos,
  e mudança de formato da pré-venda. O que o Lucas já aprovou como conteúdo ou decisão publica sem SIM técnico.
- Fluxo de mudança: branch a partir de main, `scripts/check.sh` verde, PR, merge em main, publicar, smoke completo,
  reiniciar o branch a partir de main. Prévia no `*.pages.dev` do branch quando a mudança for visual.
- Depois de toda publicação, rodar o smoke completo (`scripts/smoke.sh` pelo HTTP mais `select public.smoke_completo()`
  pelo banco: página, cadastro de teste, planilha, painel, fila). Se falhar, desfazer a publicação na hora (versão
  anterior da function, migração de reversão ou revert em main) e avisar o Lucas.
- No fim de cada dia (19h SP), resumo no chat de tudo o que foi publicado no dia.
- Segurança do banco (Lucas, 13/10): toda tabela nova nasce com RLS ativo e sem policy (só service_role); view nova nasce
  com `security_invoker = true` e sem grant para anon/authenticated; toda função nova tem `search_path` fixo, e toda
  função `security definer` passa por revisão (o que ela lê e grava, quem pode chamar) antes do merge. A chave pública
  não lê tabela, view nem função: a LP e o painel só falam com as Edge Functions. Qualquer GRANT a anon/authenticated
  entra na migração com o motivo escrito. Depois de migração, rodar o Advisor de segurança: zero alerta ERROR.

## Campanha pausada (Lucas, 14/10)

A pré-venda está interrompida por um período: `envios_ativos = false`, secretária e crons de envio desligados, turmas
fechadas, LP sem datas (`campanha_pausada = true`). Nada religa sem o SIM do Lucas. O aviso de adiamento a quem escolheu
horário é à mão, pelo WhatsApp, marcado no painel (aba Turmas, botão "Avisado"); nenhuma lista de pessoas vai pelo chat.
Nada se apaga: leads, base antiga, fila, turmas e histórico ficam guardados. O que ficou desligado e a ordem de retomada
estão em `docs/20-pausa-da-campanha.md`.

## Quem decide o quê (Lucas, 6/10; atualizado 13/10)

- O LG saiu do time em 12/10 (Lucas). O acesso dele ao painel foi removido (fora de `painel_aprovadores`; o link pessoal deixou de valer na hora) e nenhum aviso ou relatório vai mais para ele.
- Até o Lucas nomear outro responsável por growth, as decisões de growth e performance voltam ao Lucas: textos, assuntos, imagens e artes de e-mail; testes A/B; segmentação, exclusões, horários e ritmo dos disparos; roteiros de vídeo e prioridade entre canais. Relatórios de desempenho e testes de e-mail vão ao Lucas pelo painel (papel principal). A regra padrão de performance (sem resposta depois do segundo lembrete: vence quem tiver mais cadastros; em empate, mais cliques) fica suspensa enquanto o aprovador for o Lucas: item do Lucas espera o Lucas.
- Continuam com o Lucas: preço e condições comerciais, Circular e jurídico, contratações e gastos, mudança de formato da pré-venda e o SIM técnico para publicar no sistema.
- O revisor automático (`revisarConteudo`) vale para todos. Nada que use voz ou imagem da Marcela sai pela regra padrão: espera a aprovação dela.

## Cobrança de aprovações e de tarefas humanas (Lucas, 6/10)

- Todo e-mail que pede aprovação ou decisão leva o link pessoal do painel da pessoa, apontando para o item.
- Sem resposta em 4 horas úteis (9h às 19h, São Paulo): lembrete por e-mail ao responsável, com o link do painel e o item, dizendo o que espera e o que trava. Repete a cada 4 horas úteis até a decisão; cópia ao Lucas a partir do segundo lembrete.
- Tarefa humana que trava uma etapa (ex.: links do Meet): lembrete ao responsável a cada 4 horas úteis com o que falta, por que importa e o passo a passo, com cópia ao Lucas, até resolver.
