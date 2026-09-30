# Registros DNS para criar na Hostinger (konioca.com)

Nada abaixo altera registros existentes. O site atual (A na raiz), o e-mail atual (MX do Google, SPF da raiz) e o DMARC da raiz continuam como estão. Todos os nomes são relativos a `konioca.com`, como o painel da Hostinger pede.

Estado atual lido no DNS público em 30/09: raiz com SPF `include:_spf.google.com`, MX `smtp.google.com`, DMARC `p=none` com alinhamento estrito (`adkim=s; aspf=s`). Nenhum registro em `prevenda` nem em `envio`.

## Lista para criar

Um por linha: tipo, nome, valor.

```
CNAME  prevenda                  konioca-prevenda.pages.dev
MX     send.envio                feedback-smtp.us-east-1.amazonses.com   (prioridade 10)
TXT    send.envio                v=spf1 include:amazonses.com ~all
TXT    resend._domainkey.envio   [CHAVE DKIM GERADA PELO RESEND]
TXT    _dmarc.envio              v=DMARC1; p=quarantine; adkim=r; aspf=r
TXT    @                         facebook-domain-verification=[CÓDIGO GERADO PELA META]
```

TTL: 3600, como o Resend recomenda para a Hostinger. Para os testes de 3/10, 300 acelera a propagação.

## De onde vem cada valor e o que depende de quê

1. **LP (`prevenda`)**. Criar no Cloudflare Pages o projeto `konioca-prevenda` ligado a este repositório (diretório `site`). Se o nome estiver ocupado, o Cloudflare mostra outro endereço `.pages.dev` e é esse que vai no CNAME. Depois de criar o CNAME, adicionar `prevenda.konioca.com` em Pages > Custom domains; o certificado sai automático.
2. **E-mail (Resend, subdomínio `envio`)**. Em Resend > Domains, adicionar `envio.konioca.com`, região `us-east-1`. O Resend mostra as mesmas três linhas acima (MX e SPF em `send.envio`, DKIM em `resend._domainkey.envio`); só a chave DKIM é única da conta, por isso ela fica entre colchetes. Remetente: `time@envio.konioca.com` (já gravado na configuração).
   - Por que subdomínio: o DMARC da raiz exige alinhamento estrito. Enviando como `@envio.konioca.com` com DKIM do próprio `envio`, o alinhamento estrito passa, e nada da reputação do e-mail do Google na raiz é afetado.
   - O `_dmarc.envio` com `p=quarantine` vale só para o subdomínio de envio. Para receber relatórios, acrescentar `; rua=mailto:dmarc@konioca.com` ao valor (a caixa já aparece no DMARC da raiz).
3. **Meta (pixel e API de Conversões)**. Business Manager > Configurações do negócio > Segurança da marca > Domínios > Adicionar `konioca.com` > método "Registro TXT de DNS". A Meta gera o código. O TXT vai na raiz (`@`) ao lado do SPF existente; um domínio pode ter vários TXT, o SPF não é tocado. Verificar a raiz cobre o subdomínio `prevenda`.

## Conferência depois de criar

```
dig +short CNAME prevenda.konioca.com
dig +short TXT resend._domainkey.envio.konioca.com
dig +short TXT konioca.com        # deve listar o SPF antigo E o facebook-domain-verification
```
