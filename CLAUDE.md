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
  e mudança de formato da pré-venda. O que o Lucas ou o LG já aprovaram como conteúdo ou decisão publica sem SIM técnico.
- Fluxo de mudança: branch a partir de main, `scripts/check.sh` verde, PR, merge em main, publicar, smoke completo,
  reiniciar o branch a partir de main. Prévia no `*.pages.dev` do branch quando a mudança for visual.
- Depois de toda publicação, rodar o smoke completo (`scripts/smoke.sh` pelo HTTP mais `select public.smoke_completo()`
  pelo banco: página, cadastro de teste, planilha, painel, fila). Se falhar, desfazer a publicação na hora (versão
  anterior da function, migração de reversão ou revert em main) e avisar o Lucas.
- No fim de cada dia (19h SP), resumo no chat de tudo o que foi publicado no dia.

## Quem decide o quê (Lucas, 6/10)

- LG (growth) decide, sem passar pelo Lucas: textos, assuntos, imagens e artes de e-mail; testes A/B (o que testar, quando encerrar, qual versão vence); segmentação, exclusões, horários e ritmo dos disparos; roteiros de vídeo e prioridade entre canais.
- Relatórios de desempenho de cada disparo e os testes de e-mail vão ao LG pelo painel (item na aba Aprovações ou comentário), com cópia resumida ao Lucas. Decisão de performance pendente: perguntar ao LG pelo painel; sem resposta depois do segundo lembrete (4 horas úteis cada), vale a regra padrão (vence quem tiver mais cadastros; em empate, mais cliques), registrar e avisar LG e Lucas.
- Continuam com o Lucas: preço e condições comerciais, Circular e jurídico, contratações e gastos, mudança de formato da pré-venda e o SIM técnico para publicar no sistema.
- O revisor automático (`revisarConteudo`) vale para todos. Nada que use voz ou imagem da Marcela sai pela regra padrão: espera a aprovação dela.

## Cobrança de aprovações e de tarefas humanas (Lucas, 6/10)

- Todo e-mail que pede aprovação ou decisão leva o link pessoal do painel da pessoa, apontando para o item.
- Sem resposta em 4 horas úteis (9h às 19h, São Paulo): lembrete por e-mail ao responsável, com o link do painel e o item, dizendo o que espera e o que trava. Repete a cada 4 horas úteis até a decisão; cópia ao Lucas a partir do segundo lembrete.
- Tarefa humana que trava uma etapa (ex.: links do Meet): lembrete ao responsável a cada 4 horas úteis com o que falta, por que importa e o passo a passo, com cópia ao Lucas, até resolver.
