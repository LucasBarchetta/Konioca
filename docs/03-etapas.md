# Etapas de entrega

Uma PR por etapa, nesta ordem. Cada etapa fecha com testes das regras puras, `deno check` das functions e um roteiro de teste manual.

| Etapa | Entrega | Depende de |
|---|---|---|
| 1. LP + leads + Circular | Site estático (LP e obrigado), schema, functions de cadastro, configuração pública, Circular por e-mail com registro de recebimento e liberação de pagamento em 10 dias, opt-out, exportação para o Sults, pixels, UTMs, contagem regressiva, contador | Supabase, Cloudflare, Resend, PDF da Circular |
| 2. WhatsApp e convite | Webhook da Cloud API, templates para aprovação da Meta, convite em até 2 min após o cadastro, resposta com pergunta "o que você imagina fazer", seleção de perguntas para a live, lembrete 1h antes, fila por nota nos picos, trilha da base antiga (1.200), Comunidade com subgrupos por turma, "Sair" | Meta Business verificado, WABA, número aquecido |
| 3. Conversão, reserva e contrato | Mensagem pós-live com 3 botões, formulário de pedido, resumo pelo agente, painel de aprovação em 1 clique, página de reserva com aceite dos termos e link PIX só após aceite e após a liberação da Circular, webhook PIX com numeração no lote, contador, contrato via D4Sign com a opção escolhida, encaminhamento Bradesco, passagem para humano com cartão-resumo | PSP PIX, D4Sign, modelo do contrato, procedimento Bradesco |
| 4. Agentes de funil | Nota S = soma(peso x sinal) x 2^(-dias_sem_acao/3), faixas quente/morno/frio/reativar, regra-mãe (só fato novo), 2 mensagens por semana, marcos de contador e prazo, régua de retenção, áudios da Marcela por situação, grupo de controle | Anthropic API |
| 5. Painel | Leads, Comunidade, presença, pedidos, aprovações, reservas, R$, escolha de pagamento, conversão entre etapas, custo por lead e por reserva, tempos até o primeiro contato e até o humano, tudo por origem e com o grupo de controle. Relatório semanal com mudanças propostas | Etapas 1 a 4 |

Ordem dentro de cada etapa: schema, functions, site, testes, roteiro manual, PR.
