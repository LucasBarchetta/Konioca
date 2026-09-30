# Arquitetura proposta

Tese: uma única base (Supabase) com edge functions e rotinas agendadas cobre LP, leads, Circular, WhatsApp, reserva, agentes e painel, sem servidor próprio para manter. O site é estático. Tudo que é valor, data ou peso vive na tabela `config`, editável sem deploy.

## Visão geral

```
Conteúdo da Marcela / base própria / tráfego pago
        │  (UTMs em cada link)
        ▼
  LP estática (Cloudflare Pages, domínio próprio)  ──▶  obrigado.html
        │  POST /lead-intake                              │  POST /lead-intencao
        ▼                                                 ▼
  Supabase Edge Functions (Deno)  ◀──────────────────────┘
        │
        ├── Postgres: config, leads, lead_eventos, circular_envios, lotes, reservas, ...
        ├── Storage: circular/ (PDF privado), exports/ (CSV diário para o Sults)
        ├── pg_cron + pg_net: rotinas agendadas chamam as functions
        │
        ├── Resend: e-mail da Circular (anexo + link de confirmação), webhook de entrega
        ├── WhatsApp Cloud API (Meta): convites, lembretes, botões pós-live, webhook de respostas   [etapa 2]
        ├── PIX (PSP com webhook): reserva de R$ 1.000, numeração no lote, contador             [etapa 3]
        ├── D4Sign: contrato gerado do modelo aprovado                                           [etapa 3]
        ├── API do Claude: qualificação, notas, seleção de perguntas, follow-ups, relatório      [etapa 4]
        ├── Sults: API de expansão (ou CSV diário)                                               [etapa 1]
        └── Painel: página estática lendo views agregadas via function autenticada               [etapa 5]
```

## Componentes e decisões

| Componente | Escolha | Por que | Alternativa descartada |
|---|---|---|---|
| Site (LP, obrigado, reserva, painel) | HTML/CSS/JS estático em Cloudflare Pages | Fidelidade total às visualizações aprovadas, zero build, deploy por push, domínio e DNS no mesmo lugar | Next.js/Vercel: mais peças para o que é uma página |
| Banco, storage, functions, cron | Supabase (projeto novo, separado do "Konioca app") | O projeto existente na conta guarda outro sistema (modelo financeiro). Dados pessoais da pré-venda pedem base isolada, com RLS própria | Reusar o projeto existente: mistura dados e risco de LGPD |
| Configuração | Tabela `config` (chave, valor jsonb, público sim/não) | Valores e datas nunca no código; a function `public-config` expõe só o subconjunto público | Arquivo JSON no repositório: exigiria deploy para mudar preço ou data |
| E-mail transacional | Resend | Anexo PDF, webhook de entrega/abertura/clique, DKIM simples | SES: mais configuração para o mesmo resultado |
| WhatsApp | WhatsApp Cloud API (Meta), direto | Única forma oficial; templates aprovados pela Meta; webhook nativo | Z-API e similares: fora da regra do projeto |
| Agendamento | pg_cron + pg_net dentro do Postgres | Sem servidor extra; cada rotina é uma function chamada por HTTP no horário | Cron externo (GitHub Actions): mais um lugar para segredos |
| Agentes | Edge functions que chamam a API do Claude com prompts versionados no repositório | Cada rotina é uma função pura: lê estado, decide, grava proposta ou mensagem; nada muda sem aprovação humana onde a regra pede | Framework de agentes: peso desnecessário |
| Assinatura | D4Sign via API | Pedido do briefing | |
| Reserva PIX | PSP com PIX e webhook (Asaas, Pagar.me ou Stripe BR) [A DEFINIR] | Precisa de webhook confiável e link por cobrança | |

## Fluxo do lead (estado em `leads.status_funil`)

```
cadastrado → circular_enviada → circular_recebida → na_comunidade → convidado → confirmou_presenca
  → assistiu | viu_gravacao → pediu → aprovado → reservado → contrato_enviado → assinado → entregue
Saídas laterais: agora_nao, saiu (opt-out), recusado
```

Regras que o banco garante, não só o agente:

- `pagamento_liberado_em` é calculado por trigger: data de recebimento da Circular + `circular_prazo_dias` (10). A function de reserva (etapa 3) recusa qualquer cobrança antes dessa data. O agente consulta esse campo e nunca envia link antes.
- WhatsApp normalizado para E.164 e único. E-mail único (case-insensitive). Duplicado não cria registro novo.
- Consentimento com data, hora, IP e user agent, gravado na mesma transação do cadastro.
- `optout_em` preenchido interrompe toda automação (todas as rotinas filtram por ele).
- Grupo de controle: 10% dos leads (`grupo_controle = true`) sorteados no cadastro e excluídos das automações, para medir o efeito real.

## Circular de Oferta de Franquia (Lei 13.966/2019)

FATO: a lei exige entrega da Circular ao candidato com pelo menos 10 dias de antecedência da assinatura do contrato ou pré-contrato ou do pagamento de qualquer valor ao franqueador. A reserva de R$ 1.000 e o termo de reserva caem nessa regra.

INFERÊNCIA (confiança alta, validar com o jurídico): o registro mais defensável de "recebimento" é a combinação de três marcas, todas gravadas: envio pela plataforma, confirmação de entrega pelo provedor (webhook `email.delivered`) e clique do lead no botão "Confirmo que recebi a Circular". O sistema usa a entrega confirmada como data de recebimento para contar os 10 dias e guarda a confirmação explícita como reforço. Se o jurídico preferir contar só a partir da confirmação explícita, é uma linha na `config` (`circular_marco_recebimento`).

Consequência operacional: com pré-venda encerrando 30/10 23h59, quem se cadastra até 20/10 consegue reservar dentro do prazo. A LP não fala disso; o e-mail da Circular e o agente falam com naturalidade, com a data calculada da `config`.

## Dados (etapa 1)

- `config`: chave, valor (jsonb), publico, descricao. Seed com os dados fixos do briefing.
- `leads`: nome, whatsapp (E.164), email, cidade, tem_negocio, intencao, consentimento (em, ip, user_agent, texto), utm_source/medium/campaign/content/term, fbclid/gclid/ttclid, referrer, origem (classificada), turma, nota, faixa, status_funil, circular_enviada_em, circular_recebida_em, circular_confirmada_em, pagamento_liberado_em, grupo_controle, optout_em, token (para links assinados), sults_id, sults_sincronizado_em.
- `lead_eventos`: linha por sinal (cadastro, clique no grupo, entrega da Circular, etc.). É a fonte da nota da etapa 4.
- `circular_envios`: cada envio de e-mail com id do provedor, status e timestamps dos eventos do webhook.
- `lotes` e `reservas`: mínimos agora, para o contador ao vivo; ganham corpo na etapa 3.
- `rate_limit`: contagem por IP para o cadastro.

RLS ligado em tudo, sem política para `anon`. Toda escrita passa pelas edge functions com a chave de serviço, que fica só nos segredos do Supabase.

## Site

- `site/index.html` e `site/obrigado.html` portados das visualizações aprovadas: Caladea e Carlito, mesmas cores, mesma ordem de seções, mesmos textos.
- Os valores e datas do texto ficam vazios no HTML e são preenchidos no carregamento a partir de `public-config` (atributo `data-cfg`). Percentual de desconto arredondado para baixo.
- Animação do preço, contagem regressiva até o fim da pré-venda e contador de reservas (visível quando `contador_visivel` estiver ligado e houver reservas).
- UTMs, `fbclid/gclid/ttclid` e referrer capturados na primeira visita e enviados com o lead.
- Pixels Meta, TikTok e GA4 carregados com os IDs da `config`; evento de conversão disparado uma vez na página de obrigado, só para cadastro novo.
- Formulário valida WhatsApp com DDD antes de enviar; o servidor valida de novo.

## Segurança e LGPD

- Segredos só nas variáveis de ambiente das functions (`supabase secrets set`). `.env.example` lista todos sem valor.
- Cadastro protegido por honeypot e limite por IP. Webhooks verificam assinatura (Resend/Svix; Meta e PSP nas etapas seguintes).
- Links de confirmação da Circular e de opt-out usam token aleatório por lead, não o id.
- Dados mínimos, finalidade declarada no consentimento, opt-out em um clique. A política de privacidade e os termos da pré-venda são links na `config` [A PREENCHER].

## Riscos e pontos cegos

1. Aprovação de templates e verificação da empresa na Meta levam dias. É o item que mais ameaça 5/10; começa hoje.
2. O PDF da Circular ainda não existe no repositório. Sem ele, o e-mail vai sem anexo e o sistema não marca `circular_enviada_em`. O cadastro continua funcionando.
3. Sults: a API pública existe (developers.sults.com.br, módulo Expansão), mas os endpoints só aparecem com login. O adaptador fica pronto para receber URL, cabeçalho e mapeamento; até lá, CSV diário em Storage.
4. Cache do provedor de e-mail: se o webhook de entrega falhar, uma rotina horária reconsulta o status pela API do Resend.
5. Contador ao vivo antes da live mostra zero. Fica oculto até `contador_visivel` ser ligado no dia 15/10.
