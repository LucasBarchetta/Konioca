// Regras puras do WhatsApp oficial (sem banco, sem rede): provedor, endereço de envio, cabeçalho da chave,
// segredo do webhook. Decisão de 1/10: coexistência com o número do app via 360dialog (plano Regular). A API da
// 360dialog é espelho da Cloud API da Meta (mesmo corpo de mensagem); muda o endereço e o cabeçalho da chave, e o
// webhook não vem assinado como o da Meta: quem protege é um segredo nosso na URL (WHATSAPP_WEBHOOK_SEGREDO).
// Testado no Node.

export type Provedor = "meta" | "360dialog";

export const GRAPH_META = "https://graph.facebook.com/v21.0";
export const BASE_360 = "https://waba-v2.360dialog.io";

export function provedorDe(valor: string | undefined | null): Provedor {
  return String(valor ?? "").trim().toLowerCase() === "360dialog" ? "360dialog" : "meta";
}

/** Endereço do POST /messages. Na 360dialog o número vai pela chave, não pela URL. */
export function enderecoEnvio(provedor: Provedor, phoneNumberId: string): string {
  return provedor === "360dialog" ? `${BASE_360}/messages` : `${GRAPH_META}/${phoneNumberId}/messages`;
}

/** Cabeçalho de autenticação: Meta usa Bearer; 360dialog usa D360-API-KEY com a chave gerada no Hub. */
export function cabecalhosAuth(provedor: Provedor, token: string): Record<string, string> {
  return provedor === "360dialog"
    ? { "D360-API-KEY": token, "content-type": "application/json" }
    : { "authorization": `Bearer ${token}`, "content-type": "application/json" };
}

/** O que precisa existir para o envio funcionar em cada provedor. */
export function configuradoCom(provedor: Provedor, token: string | undefined, phoneNumberId: string | undefined): boolean {
  if (!token) return false;
  return provedor === "360dialog" ? true : !!phoneNumberId;
}

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Webhook da 360dialog: aceita só com ?s=<segredo> igual ao WHATSAPP_WEBHOOK_SEGREDO (comparação em tempo constante). */
export function segredoUrlOk(urlRecebida: string, segredo: string | undefined | null): boolean {
  if (!segredo || segredo.length < 16) return false;
  let s = "";
  try { s = new URL(urlRecebida).searchParams.get("s") ?? ""; } catch { return false; }
  return igual(s, segredo);
}

/** URL que registramos na 360dialog para receber mensagens e status. */
export function urlWebhook(supabaseUrl: string, segredo: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/whatsapp-webhook?s=${encodeURIComponent(segredo)}`;
}
