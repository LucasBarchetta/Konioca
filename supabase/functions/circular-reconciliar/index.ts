// POST /circular-reconciliar — (cron, chave de serviço) reconsulta no Resend os envios sem evento de entrega.
// Cobre webhook perdido. Usa GET https://api.resend.com/emails/{id} -> last_event.
import { db, exigirServico } from "../_shared/db.ts";
import { json } from "../_shared/http.ts";
import { aplicarEventoCircular } from "../_shared/circular.ts";

const MAPA: Record<string, string> = {
  delivered: "email.delivered", opened: "email.opened", clicked: "email.clicked", bounced: "email.bounced", complained: "email.complained",
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401);
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ erro: "RESEND_API_KEY ausente" }, 500);

  const limite = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: envios } = await db().from("circular_envios")
    .select("id, provedor_id, status, enviado_em")
    .eq("status", "enviado").not("provedor_id", "is", null).lt("enviado_em", limite)
    .order("enviado_em", { ascending: true }).limit(100);

  let atualizados = 0;
  for (const e of envios ?? []) {
    const r = await fetch(`https://api.resend.com/emails/${e.provedor_id}`, { headers: { authorization: `Bearer ${apiKey}` } });
    if (!r.ok) continue;
    const info = await r.json().catch(() => null) as { last_event?: string } | null;
    const tipo = info?.last_event ? MAPA[info.last_event] : undefined;
    if (!tipo) continue;
    // Sem timestamp do evento na consulta: usa agora como marco conservador (posterior ao real, nunca anterior).
    if (await aplicarEventoCircular(e.provedor_id, tipo, new Date().toISOString(), { reconciliado: true, last_event: info?.last_event })) atualizados++;
  }
  return json({ ok: true, verificados: envios?.length ?? 0, atualizados });
});
