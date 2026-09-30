# Konioca · Pré-venda da nova geração

Infraestrutura da pré-venda da nova geração da máquina Konioca (modelo Franquia Inteligente).
Agentes montam e operam a estrutura. Humanos fazem só: live, conversa nos grupos, aprovação de compradores e atendimento de quem quer comprar.

Documentos de referência:

- [docs/01-arquitetura.md](docs/01-arquitetura.md): arquitetura proposta, fluxo de dados, decisões e riscos.
- [docs/02-contas-e-chaves.md](docs/02-contas-e-chaves.md): contas e chaves que um humano precisa criar, na ordem em que bloqueiam o trabalho.
- [docs/03-etapas.md](docs/03-etapas.md): as cinco etapas de entrega, uma PR por etapa, e o que cada uma inclui.
- [docs/04-operacao-etapa-1.md](docs/04-operacao-etapa-1.md): como publicar e operar a LP, os leads e a Circular.
- [docs/06-whatsapp-modelos.md](docs/06-whatsapp-modelos.md): modelos de mensagem para submeter à Meta.
- [docs/07-operacao-etapa-2.md](docs/07-operacao-etapa-2.md): WhatsApp, convite, perguntas da live e base antiga.
- [docs/05-dns-hostinger.md](docs/05-dns-hostinger.md): registros DNS para criar na Hostinger (LP, e-mail, Meta).
- [docs/politica-privacidade.md](docs/politica-privacidade.md): rascunho da política de privacidade para o jurídico (dados armazenados nos EUA).
- [docs/capturas/](docs/capturas/): LP e obrigado em 390px, referência aprovada ao lado da porta.

Estrutura do repositório:

```
site/                 LP e página de obrigado (HTML estático, mobile primeiro)
supabase/migrations/  schema, seed de configuração, agendamentos (pg_cron)
supabase/functions/   edge functions (Deno): cadastro, configuração pública, Circular, opt-out, exportação
tests/                testes das regras puras (validação de WhatsApp, origem, datas)
scripts/              verificação local (deno check + testes)
```

Regras fixas do projeto:

- Todos os valores e datas ficam na tabela `config`, nunca no código.
- Segredos só em variáveis de ambiente (ver `.env.example`).
- Nada de WhatsApp fora da API oficial da Meta.
- A LP não menciona regra de devolução. Isso fica nos termos da reserva e no contrato.
- Colchetes `[ASSIM]` marcam o que ainda precisa ser preenchido por um humano.
