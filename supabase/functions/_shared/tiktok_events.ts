// TikTok Events API: evento SubmitForm enviado pelo servidor, deduplicado com o pixel pelo event_id.
// Sem TIKTOK_ACCESS_TOKEN, pula em silêncio (os pixels seguem só no navegador). Dados pessoais vão hasheados (SHA-256).
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface LeadTiktok {
  event_id: string; email: string; whatsappE164: string; ip: string; userAgent: string; url: string | null; ttclid: string | null; quandoMs: number;
}

/** Monta o payload (exportado para teste). */
export async function montarEventoTiktok(pixelId: string, l: LeadTiktok) {
  return {
    event_source: "web",
    event_source_id: pixelId,
    data: [{
      event: "SubmitForm",
      event_time: Math.floor(l.quandoMs / 1000),
      event_id: l.event_id,
      user: {
        email: await sha256(l.email.trim().toLowerCase()),
        phone: await sha256(l.whatsappE164),
        ip: l.ip || undefined,
        user_agent: l.userAgent || undefined,
        ttclid: l.ttclid ?? undefined,
      },
      page: { url: l.url ?? undefined },
      properties: { content_name: "prevenda_nova_geracao" },
    }],
  };
}

export async function enviarLeadTiktok(pixelId: string, l: LeadTiktok): Promise<{ ok: boolean; motivo?: string }> {
  const token = Deno.env.get("TIKTOK_ACCESS_TOKEN");
  if (!token) return { ok: false, motivo: "TIKTOK_ACCESS_TOKEN ausente" };
  if (!pixelId) return { ok: false, motivo: "tiktok_pixel_id ausente" };
  const r = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
    method: "POST", headers: { "content-type": "application/json", "Access-Token": token },
    body: JSON.stringify(await montarEventoTiktok(pixelId, l)), signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return { ok: false, motivo: "tiktok " + r.status + " " + (await r.text().catch(() => "")).slice(0, 300) };
  return { ok: true };
}
