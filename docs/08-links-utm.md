# Links com UTM da captação

Base: `https://prevenda.konioca.com/`. Campanha única da captação: `prevenda_captacao`. A LP guarda a primeira origem da pessoa por 30 dias (first touch): quem chega pela bio e volta pelos stories conta como bio.

Como a planilha e o painel classificam (`classificarOrigem`): `instagram` e `tiktok` caem em "Conteúdo da Marcela"; `whatsapp` cai em "Base própria". A coluna "Canal (UTM)" da planilha mostra o detalhe (`instagram / stories`).

| Onde | Link |
|---|---|
| Bio do Instagram | https://prevenda.konioca.com/?utm_source=instagram&utm_medium=bio&utm_campaign=prevenda_captacao |
| Stories do Instagram | https://prevenda.konioca.com/?utm_source=instagram&utm_medium=stories&utm_campaign=prevenda_captacao |
| Posts da Marcela (feed e reels, link na legenda ou no comentário fixado) | https://prevenda.konioca.com/?utm_source=instagram&utm_medium=post&utm_campaign=prevenda_captacao&utm_content=marcela |
| TikTok (bio e vídeos) | https://prevenda.konioca.com/?utm_source=tiktok&utm_medium=bio&utm_campaign=prevenda_captacao |
| WhatsApp (mensagens do time, status, listas) | https://prevenda.konioca.com/?utm_source=whatsapp&utm_medium=mensagem&utm_campaign=prevenda_captacao |

Regras para não sujar a medição:

1. Anúncio pago não usa estes links. O Meta e o TikTok acrescentam `fbclid` e `ttclid`, e a origem vira "Tráfego pago" sozinha. Para anúncio, usar `utm_medium=cpc` e `utm_content` com o nome do criativo.
2. Um link por lugar. Para comparar dois stories, mudar só o `utm_content` (`...&utm_content=story_bastidor`).
3. Tudo em minúsculas e sem acento: o Sheets e o painel tratam `Instagram` e `instagram` como valores diferentes.
