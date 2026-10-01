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
