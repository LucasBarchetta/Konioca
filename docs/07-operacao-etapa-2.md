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

## Comunidade e turmas

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
| P2 | E-mail primeiro, WhatsApp em lotes depois de 48h | 703 | 679 |
| P3 | E-mail, WhatsApp só se clicar | 202 | 195 |
| P4 | E-mail, WhatsApp só se clicar | 256 | 239 |

Duas linhas marcadas como possível cadastro de teste ficam fora (`status = 'revisar'`). Sem WhatsApp: 10 sem telefone, 18 com 10 dígitos e 23 números que não são celular válido.

Em 5/10, promover e agendar os e-mails (lotes de 150 por hora):
```
curl -X POST -H "Authorization: Bearer <SERVICE_ROLE_KEY>" https://ytsildpxummevfkjcjhs.supabase.co/functions/v1/base-antiga-importar
```
A function recusa rodar antes de `captacao_inicio`. Depois disso, o `base-antiga-processar` (a cada 30 minutos) faz o WhatsApp em lotes de 15, uma tentativa por pessoa, e para se a fila for pausada por qualidade do número.

Para recarregar uma planilha nova (dados nunca no repositório):
```
SUPABASE_URL=https://ytsildpxummevfkjcjhs.supabase.co SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/base_antiga_preparar.py /caminho/fora/do/repo/base.xlsx --enviar
```
Linhas já promovidas não são sobrescritas.
