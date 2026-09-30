# Modelos de mensagem do WhatsApp para submeter à Meta

Submeter até 4/10 em WhatsApp Manager > Modelos de mensagem. Idioma: Português (BR). Os nomes precisam ser exatamente estes, porque o sistema os lê da configuração (`wa_tpl_*`).

Regras de voz aplicadas: uma pergunta por mensagem, sem saudação padrão, sem exclamação, assinatura do Time da Marcela, nenhuma exclusividade falsa. As exclusividades citadas são as reais: lista, live fechada, 250 máquinas e prazo. Não existe lote extra.

Categoria: a Meta decide a final. Convites são Marketing. Lembretes do evento e da Circular foram escritos como Utilidade, sem chamada de venda. Se a Meta reclassificar para Marketing, nada muda no código.

## 1. `konioca_convite_live` · Marketing

Corpo:
```
{{1}}, seu nome está na lista da pré-venda da nova Konioca. A live é fechada para quem está na lista: {{2}}, {{3}}, às {{4}}. A pré-venda tem {{5}} máquinas. Você consegue estar lá?
```
Exemplos: `Ana` · `quinta` · `15/10` · `19h` · `250`

Rodapé: `Time da Marcela · responda Sair para não receber mais`

Botões, nesta ordem:
1. URL dinâmica, texto `Entrar no grupo`, URL `https://chat.whatsapp.com/{{1}}`, exemplo `AbCdEf123`
2. Resposta rápida `Vou estar lá`
3. Resposta rápida `Sair`

## 2. `konioca_lembrete_live` · Utilidade

```
{{1}}, a live da nova Konioca começa às {{2}}. O link para entrar: {{3}}
```
Exemplos: `Ana` · `19h` · `https://meet.google.com/abc-defg-hij`

Rodapé: `Time da Marcela`

## 3. `konioca_lembrete_live_pergunta` · Utilidade

Só vai para quem teve a pergunta selecionada.
```
{{1}}, a live começa às {{2}} e a Marcela separou a sua pergunta para responder ao vivo: "{{3}}". O link: {{4}}
```
Exemplos: `Ana` · `19h` · `Cabe numa academia pequena?` · `https://meet.google.com/abc-defg-hij`

Rodapé: `Time da Marcela`

## 4. `konioca_gravacao` · Marketing

Dia seguinte, para todos os convidados (a gravação vai para quem se cadastrou), com a mesma pergunta do fim da live.
```
{{1}}, a gravação da live da nova Konioca está aqui: {{2}}. Depois de assistir, como você quer seguir?
```
Exemplos: `Ana` · `https://youtu.be/exemplo`

Rodapé: `Time da Marcela`

Botões (respostas rápidas): `Quero uma` · `Tenho uma dúvida` · `Agora não`

## 5. `konioca_circular_lembrete` · Utilidade

```
{{1}}, falta um clique para confirmar que você recebeu a Circular de Oferta de Franquia. O prazo da lei só começa a contar depois disso. Quem confirma até {{2}} ainda reserva na pré-venda: {{3}}
```
Exemplos: `Ana` · `20/10` · `https://ytsildpxummevfkjcjhs.supabase.co/functions/v1/circular-confirmar?t=exemplo`

Rodapé: `Time da Marcela`

## 6. `konioca_base_antiga` · Marketing

Base antiga ainda não está na lista, então o botão leva à LP (cadastro, aceite e Circular).
```
{{1}}, você procurou a Konioca {{2}}. A gente refez a máquina, e a Marcela mostra a nova geração numa live fechada para quem está na lista: {{3}}, {{4}}, às {{5}}. Quer entrar na lista?
```
Exemplos: `Ana` · `em fevereiro` · `quinta` · `15/10` · `19h`

Rodapé: `Time da Marcela · responda Sair para não receber mais`

Botões:
1. URL fixa, texto `Quero entrar na lista`, URL `https://prevenda.konioca.com/?utm_source=base&utm_medium=whatsapp&utm_campaign=base_antiga`
2. Resposta rápida `Sair`

## Etapa 3 (submeter junto, para não perder a janela de aprovação)

`konioca_pos_live` · Marketing. Enviado no fim da live a quem assistiu.
```
{{1}}, obrigado por estar na live. Como você quer seguir?
```
Botões (respostas rápidas): `Quero uma` · `Tenho uma dúvida` · `Agora não`
