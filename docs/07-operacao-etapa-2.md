# Operação da etapa 2: WhatsApp, convite e base antiga

## Ligar o WhatsApp (depende da Meta)

1. Meta Business verificado, WABA criada, número dedicado registrado.
2. Token permanente de usuário do sistema com `whatsapp_business_messaging` e `whatsapp_business_management`.
3. Webhook do app: URL `https://ytsildpxummevfkjcjhs.supabase.co/functions/v1/whatsapp-webhook`, token de verificação igual a `WHATSAPP_VERIFY_TOKEN`, campo `messages` assinado.
4. Segredos:
   ```
   supabase secrets set --project-ref ytsildpxummevfkjcjhs WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_WABA_ID=... WHATSAPP_VERIFY_TOKEN=... WHATSAPP_APP_SECRET=...
   ```
5. Modelos de `docs/06-whatsapp-modelos.md` aprovados.

Sem as credenciais, a fila segura os itens de WhatsApp e tenta de novo a cada 10 minutos, sem gastar tentativa. E-mails seguem normalmente.

## Plano B (WABA não aprovada em 5/10)

```sql
update config set valor = '"email"' where chave = 'canal_aquecimento';
```
Convites de cadastros novos passam a sair por e-mail. Quando a WABA liberar, voltar para `"whatsapp"`. Quem já recebeu por e-mail não recebe outro convite.

## Formato de 2/10: encontros fechados no Google Meet

A live de 15/10 às 19h foi substituída por encontros fechados pelo Google Meet (30 minutos, até 35 pessoas, durante o
dia, só para quem está na lista). Turmas, escolha de horário, confirmação e lembretes estão em docs/14 (aba Turmas),
docs/15 (textos) e docs/19 (roteiro). O P2 da base antiga foi suspenso em 2/10 e só sai com o "sim" do Lucas nos
testes reescritos (A e B). As seções abaixo sobre Comunidade, perguntas para a live, lembrete e gravação ficam como
histórico: `config.turmas` e o cron `live-disparos` não são mais usados (migração 800).

## Comunidade e turmas (histórico, não usado desde 2/10)

A Comunidade e os subgrupos são criados por uma pessoa no aplicativo (a API oficial não cria comunidades). Depois, registrar os links:
```sql
update config set valor = '[{"nome":"Turma de quinta · 15/10","live":"2026-10-15T19:00:00-03:00","subgrupo_link":"https://chat.whatsapp.com/XXXX"}]' where chave = 'turmas';
update config set valor = '"https://chat.whatsapp.com/YYYY"' where chave = 'whatsapp_grupo_link';
```

## Como o convite anda

1. Cadastro na LP: convite na fila em até 1 minuto, prioridade pela nota (picos após posts da Marcela são atendidos por nota, não por ordem de chegada). Grupo de controle fica fora.
2. Resposta "Vou estar lá" ou "não": agradece, pergunta o que a pessoa imagina fazer com a Konioca e, dentro da janela de 24h, manda o áudio da Marcela (`wa_audios.convite`).
3. Resposta à pergunta: vira candidata para a live (`perguntas_live`).
4. Dúvida ou qualquer mensagem depois disso: passa para pessoa, com cartão-resumo em `alertas` e e-mail para `alerta_email`. No horário comercial o lead ouve "até 15 minutos"; fora dele, quando o time retoma.
5. "Sair" em qualquer momento: opt-out, fila cancelada, uma única confirmação.

## Perguntas para a live

Rodam todo dia às 8h. Para rodar agora e ver o resultado:
```
curl -X POST -H "Authorization: Bearer <SERVICE_ROLE_KEY>" https://ytsildpxummevfkjcjhs.supabase.co/functions/v1/perguntas-selecionar
select ordem, nome, cidade, texto, motivo from perguntas_live where selecionada order by ordem;
```
Para fixar uma pergunta à mão: `update perguntas_live set selecionada = true, selecionada_por = 'humano', ordem = 1 where lead_id = '...'`. O agente nunca desfaz a escolha humana.

## Lembrete e gravação

Automáticos pela `config.turmas`: lembrete 1h antes (com a pergunta só para quem foi selecionado) e gravação no dia seguinte às 10h para todos os convidados (FAQ v3: a gravação vai para quem se cadastrou). Pré-requisitos: `live_link` e `live_gravacao_link` preenchidos. A presença (`assistiu_em`) é registrada na etapa 3 e serve ao placar; a gravação vai para todos de qualquer forma.

## Base antiga (1.210 pessoas, carregada em 30/09)

Carregada em `base_antiga` a partir da planilha do Drive, sem passar pelo repositório. Nada foi enviado.

| Prioridade | Regra | Pessoas | Com WhatsApp |
|---|---|---|---|
| P1 | WhatsApp + e-mail | 49 | 46 |
| P2 | E-mail; WhatsApp só se clicar (decisão de 30/09, reavaliar depois de 15/10) | 703 | 679 |
| P3 | E-mail, WhatsApp só se clicar | 202 | 195 |
| P4 | E-mail, WhatsApp só se clicar | 256 | 239 |

Duas linhas marcadas como possível cadastro de teste ficam fora (`status = 'revisar'`). Sem WhatsApp: 10 sem telefone, 18 com 10 dígitos e 23 números que não são celular válido.

Calendário de 1/10 (substitui o anterior): P1 em 1/10; P2 em 2/10 às 9h; P3 e P4 em 5/10 às 9h. Cada versão do e-mail
sai só depois do "sim" do Lucas no teste (`email-teste` com `tipo: base_antiga_email` e `prioridade`). Lotes de 150 por
hora, pausa automática com devolução acima de 3% (docs/16). Nenhum WhatsApp para a base antiga até o número oficial
ligar (`base_antiga_whatsapp_ativo = false`). Promoção por prioridade, com hora de início (migração 730):
```sql
select * from public.base_antiga_promover(2000, array['P1']);                                   -- agora
select * from public.base_antiga_promover(2000, array['P2'], '2026-10-02T09:00:00-03:00');       -- sexta 9h
select * from public.base_antiga_promover(2000, array['P3','P4'], '2026-10-05T09:00:00-03:00');  -- segunda 9h
```
O e-mail de cada prioridade leva `utm_content=p1|p2|p34`, que o painel usa para separar os canais. O caminho antigo
(`base-antiga-importar`, tudo de uma vez em `captacao_inicio`) continua existindo, mas não é o calendário em vigor. Depois disso, o `base-antiga-processar` (a cada 30 minutos) manda WhatsApp a quem clicou no e-mail, em lotes de 15, uma tentativa por pessoa, e para se a fila for pausada por qualidade do número. P1 já recebe WhatsApp junto com o e-mail. Para voltar a regra original do P2 (WhatsApp em lotes 48h depois do e-mail, mesmo sem clique):
```sql
update config set valor = '"lotes"' where chave = 'base_antiga_p2_regra';
```

Para recarregar uma planilha nova (dados nunca no repositório):
```
SUPABASE_URL=https://ytsildpxummevfkjcjhs.supabase.co SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/base_antiga_preparar.py /caminho/fora/do/repo/base.xlsx --enviar
```
Linhas já promovidas não são sobrescritas.

## P2 em teste A/B (decisão do Lucas, 1/10 à noite)

SIM do Lucas (1/10, noite) para 2/10 com o texto novo dos encontros no Meet. Revisão posterior do Lucas: a versão B só
entra se ele confirmar até 8h30 que a Marcela aprovou; sem essa confirmação, sai só a A, metade às 9h e metade às 15h. Para isso a `fila-processar` v19 foi publicada com o texto aprovado da base antiga
e a chave `encontros_ativos` desligada: o convite de cadastro novo continua o legado até as turmas serem publicadas.
Ritmo da fila: 20 e-mails por minuto (`wa_envios_por_minuto` vale para a leitura do lote), ou seja, 350 saem em uns 18
minutos. Lembretes armados na sessão: 8h48 (promover 350), 9h30 (conferir), 15h (relatório e resto com a vencedora),
18h30 (fechamento do dia).

Substitui o disparo único de 2/10. Versão A: texto aprovado (abertura do P2, link `utm_content=p2_a`). Versão B: assunto e abertura pelo preço, na voz da Marcela (`p2_b`), só sai com o SIM do Lucas; sem o SIM até 8h, o dia vira 350 com a A às 9h e o resto com a A às 15h. Com o SIM: 9h, 350 pessoas sorteadas, 175 A e 175 B (`base_antiga_promover_ab(350, array['P2'], '2026-10-02T09:00-03:00')`); 15h, as outras 353 recebem a versão com mais cadastros pela página (empate: mais cliques; zero a zero: espera segunda), com `base_antiga_promover_ab(400, array['P2'], '2026-10-02T15:00-03:00', array['a'])` ou `array['b']`. A variante fica em `leads.base_antiga_variante` e o painel e a aba Desempenho separam pelo link. Migração 770.
