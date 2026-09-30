// API de Conversões da Meta: evento Lead enviado pelo servidor, deduplicado com o pixel pelo event_id.
// Dados pessoais vão hasheados (SHA-256, normalizados) como a Meta exige.

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normNome(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

export interface LeadCapi {
  event_id: string; email: string; whatsappE164: string; nome: string; cidade: string | null;
  ip: string; userAgent: string; url: string | null; fbp: string | null; fbc: string | null; fbclid: string | null; quandoMs: number;
}

/** Monta o payload (exportado para teste). */
export async function montarEventoLead(l: LeadCapi, testEventCode?: string) {
  const partes = l.nome.trim().split(/\s+/);
  const fn = normNome(partes[0] ?? ""), ln = normNome(partes.slice(1).join(" "));
  const cidade = l.cidade ? normNome(l.cidade.split(",")[0]) : "";
  const fbc = l.fbc ?? (l.fbclid ? `fb.1.${l.quandoMs}.${l.fbclid}` : null);
  const user_data: Record<string, unknown> = {
    em: [await sha256(l.email.trim().toLowerCase())],
    ph: [await sha256(l.whatsappE164.replace(/\D/g, ""))],
    fn: fn ? [await sha256(fn)] : undefined,
    ln: ln ? [await sha256(ln)] : undefined,
    ct: cidade ? [await sha256(cidade)] : undefined,
    country: [await sha256("br")],
    client_ip_address: l.ip || undefined,
    client_user_agent: l.userAgent || undefined,
    fbp: l.fbp ?? undefined,
    fbc: fbc ?? undefined,
    external_id: [await sha256(l.event_id)],
  };
  const payload: Record<string, unknown> = {
    data: [{
      event_name: "Lead",
      event_time: Math.floor(l.quandoMs / 1000),
      event_id: l.event_id,
      action_source: "website",
      event_source_url: l.url ?? undefined,
      user_data,
      custom_data: { content_name: "prevenda_nova_geracao" },
    }],
  };
  if (testEventCode) payload.test_event_code = testEventCode;
  return payload;
}

export async function enviarLeadCapi(pixelId: string, l: LeadCapi, testEventCode?: string): Promise<{ ok: boolean; motivo?: string }> {
  const token = Deno.env.get("META_CAPI_TOKEN");
  if (!token) return { ok: false, motivo: "META_CAPI_TOKEN ausente" };
  if (!pixelId) return { ok: false, motivo: "meta_pixel_id ausente" };
  const payload = await montarEventoLead(l, testEventCode || undefined);
  const r = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!r.ok) return { ok: false, motivo: "graph " + r.status + " " + (await r.text().catch(() => "")).slice(0, 300) };
  return { ok: true };
}
