// Verificação do Cloudflare Turnstile (siteverify). Roda antes de gravar.
// Três saídas: ok (token válido), recusado (token inválido ou ausente: cadastro negado),
// indisponivel (Cloudflare fora do ar, segredo ausente ou resposta estranha: o cadastro entra e fica marcado "sem verificação").
// Regra do Lucas: nunca perder cadastro legítimo por falha de um terceiro.
export type Turnstile = { status: "ok" } | { status: "recusado"; motivo: string } | { status: "indisponivel"; motivo: string };

function segredo(): string {
  return Deno.env.get("TURNSTILE_SECRET_KEY") ?? Deno.env.get("TURNSTILE_SECRET") ?? "";
}

/** Classifica a resposta do siteverify (pura, testável). Códigos de token são recusa; o resto é indisponibilidade. */
export function classificarSiteverify(httpOk: boolean, corpo: { success?: boolean; "error-codes"?: string[] } | null): Turnstile {
  if (!httpOk || !corpo || typeof corpo.success !== "boolean") return { status: "indisponivel", motivo: "siteverify sem resposta válida" };
  if (corpo.success) return { status: "ok" };
  const codigos = corpo["error-codes"] ?? [];
  const deToken = /^(invalid-input-response|missing-input-response|timeout-or-duplicate|bad-request)$/;
  if (codigos.length && codigos.every((c) => deToken.test(c))) return { status: "recusado", motivo: codigos.join(",") };
  // invalid-input-secret, internal-error e afins são problema nosso ou da Cloudflare, não do visitante.
  return { status: "indisponivel", motivo: codigos.join(",") || "recusado sem código" };
}

export async function verificarTurnstile(token: string | undefined, ip: string): Promise<Turnstile> {
  const s = segredo();
  if (!s) return { status: "indisponivel", motivo: "TURNSTILE_SECRET_KEY ausente" };
  if (!token) return { status: "recusado", motivo: "token ausente" };
  const corpo = new URLSearchParams({ secret: s, response: token });
  if (ip) corpo.set("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: corpo, signal: AbortSignal.timeout(6000) });
    const j = await r.json().catch(() => null) as { success?: boolean; "error-codes"?: string[] } | null;
    return classificarSiteverify(r.ok, j);
  } catch (e) {
    return { status: "indisponivel", motivo: "siteverify indisponível: " + (e as Error).message };
  }
}
