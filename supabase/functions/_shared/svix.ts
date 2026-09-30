// Verificação de assinatura de webhooks no padrão Svix (usado pelo Resend).
// Cabeçalhos: svix-id, svix-timestamp, svix-signature ("v1,base64 v1,base64").
// Segredo: "whsec_<base64>".

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

function igualConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verificarSvix(req: Request, corpo: string, segredo: string, toleranciaSeg = 300): Promise<boolean> {
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sig = req.headers.get("svix-signature");
  if (!id || !ts || !sig || !segredo) return false;
  const agora = Math.floor(Date.now() / 1000);
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(agora - t) > toleranciaSeg) return false;

  const chave = b64ToBytes(segredo.replace(/^whsec_/, ""));
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinado = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${ts}.${corpo}`));
  const esperado = bytesToB64(assinado);
  for (const parte of sig.split(" ")) {
    const [ver, val] = parte.split(",");
    if (ver === "v1" && val && igualConstante(val, esperado)) return true;
  }
  return false;
}
