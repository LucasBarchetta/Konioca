// Verificação do Cloudflare Turnstile (siteverify). Roda antes de qualquer gravação ou disparo.
export async function verificarTurnstile(token: string | undefined, ip: string): Promise<{ ok: boolean; motivo?: string }> {
  const segredo = Deno.env.get("TURNSTILE_SECRET");
  if (!segredo) return { ok: false, motivo: "TURNSTILE_SECRET ausente" };
  if (!token) return { ok: false, motivo: "token ausente" };
  const corpo = new URLSearchParams({ secret: segredo, response: token });
  if (ip) corpo.set("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: corpo });
    const j = await r.json() as { success?: boolean; "error-codes"?: string[] };
    return j.success ? { ok: true } : { ok: false, motivo: (j["error-codes"] ?? []).join(",") || "recusado" };
  } catch (e) {
    return { ok: false, motivo: "siteverify indisponível: " + (e as Error).message };
  }
}
