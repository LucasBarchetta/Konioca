# Regras de trabalho neste repositório (Lucas, 1/10)

Permissões técnicas ficam em `.claude/settings.json`. O que a ferramenta não consegue distinguir vale por conduta:

- `execute_sql` no Supabase: só leitura (SELECT) sem pedir. UPDATE, INSERT, DELETE ou DDL em produção só depois do SIM explícito do Lucas no chat, na mesma conversa.
- Chamada direta a function de envio em produção (fila-processar, circular-enviar, circular-lembrete, live-disparos, base-antiga-processar, email-teste para pessoas de fora da lista de aprovadores, painel-avisar), por curl ou por `chamar_function` no SQL: só depois do SIM. Teste para um aprovador pela exceção interna está liberado.
- Publicação (deploy de function, migração, merge ou push em main, config que muda comportamento ao vivo, segredos, envio a pessoas reais): sempre com SIM antes. Nunca usar modo que pula confirmações.
- Sempre bloqueado: apagar dados em produção sem pedido do Lucas; ler ou imprimir segredos (arquivos .env, Vault, segredos de functions, chaves em prints).
- Segredos e links de acesso ao painel nunca passam pelo chat: nascem no banco ou no Supabase e vão por e-mail a um aprovador.
- Dados pessoais de leads e de terceiros nunca entram no repositório, nos prompts nem nas capturas de prévia (usar dados fictícios).
- Toda mudança nova: prévia no `*.pages.dev` do branch, SIM, depois PR e merge em main, depois reiniciar o branch a partir de main.
- Depois de cada publicação, rodar o teste de ponta a ponta (`scripts/smoke.sh` ou o equivalente pelo banco, descrito no cabeçalho do script).

## Quem decide o quê (Lucas, 6/10)

- LG (growth) decide, sem passar pelo Lucas: textos, assuntos, imagens e artes de e-mail; testes A/B (o que testar, quando encerrar, qual versão vence); segmentação, exclusões, horários e ritmo dos disparos; roteiros de vídeo e prioridade entre canais.
- Relatórios de desempenho de cada disparo e os testes de e-mail vão ao LG pelo painel (item na aba Aprovações ou comentário), com cópia resumida ao Lucas. Decisão de performance pendente: perguntar ao LG pelo painel; sem resposta depois do segundo lembrete (4 horas úteis cada), vale a regra padrão (vence quem tiver mais cadastros; em empate, mais cliques), registrar e avisar LG e Lucas.
- Continuam com o Lucas: preço e condições comerciais, Circular e jurídico, contratações e gastos, mudança de formato da pré-venda e o SIM técnico para publicar no sistema.
- O revisor automático (`revisarConteudo`) vale para todos. Nada que use voz ou imagem da Marcela sai pela regra padrão: espera a aprovação dela.

## Cobrança de aprovações e de tarefas humanas (Lucas, 6/10)

- Todo e-mail que pede aprovação ou decisão leva o link pessoal do painel da pessoa, apontando para o item.
- Sem resposta em 4 horas úteis (9h às 19h, São Paulo): lembrete por e-mail ao responsável, com o link do painel e o item, dizendo o que espera e o que trava. Repete a cada 4 horas úteis até a decisão; cópia ao Lucas a partir do segundo lembrete.
- Tarefa humana que trava uma etapa (ex.: links do Meet): lembrete ao responsável a cada 4 horas úteis com o que falta, por que importa e o passo a passo, com cópia ao Lucas, até resolver.
