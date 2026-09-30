// POST /circular-enviar — (interno, chave de serviço) envia ou reenvia a Circular para um lead.
// Corpo: { lead_id } ou { pendentes: true } para todos os cadastrados sem envio (ex.: PDF chegou depois).
// O cron circular-pendentes chama com { pendentes: true } a cada 10 min; sem PDF ou sem Resend, para no primeiro.
import { db, exigirServico } from "../_shared/db.ts";
import { json, lerJson } from "../_shared/http.ts";
import { enviarCircular } from "../_shared/circular.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401);
  const b = await lerJson<{ lead_id?: string; pendentes?: boolean; forcar?: boolean; limite?: number }>(req);

  if (b?.lead_id) {
    const r = await enviarCircular(b.lead_id, { forcar: !!b.forcar });
    return json(r, r.ok ? 200 : 422);
  }
  if (b?.pendentes) {
    const { data: leads } = await db().from("leads").select("id")
      .is("circular_enviada_em", null).is("optout_em", null)
      .order("criado_em", { ascending: true }).limit(b.limite ?? 200);
    // Quem já falhou 3 vezes no provedor (e-mail inválido, por exemplo) sai da repetição automática.
    const ids = (leads ?? []).map((l) => l.id);
    const { data: falhas } = ids.length
      ? await db().from("circular_envios").select("lead_id").eq("status", "falhou").in("lead_id", ids)
      : { data: [] as { lead_id: string }[] };
    const nFalhas = new Map<string, number>();
    for (const f of falhas ?? []) nFalhas.set(f.lead_id, (nFalhas.get(f.lead_id) ?? 0) + 1);
    const resultados: Record<string, string> = {};
    for (const l of leads ?? []) {
      if ((nFalhas.get(l.id) ?? 0) >= 3) { resultados[l.id] = "3 falhas no provedor, ver circular_envios"; continue; }
      const r = await enviarCircular(l.id);
      resultados[l.id] = r.ok ? "ok" : (r.motivo ?? "erro");
      if (!r.ok && /PDF|RESEND_API_KEY|email_from/.test(r.motivo ?? "")) break; // bloqueio global, não adianta continuar
    }
    return json({ ok: true, total: Object.keys(resultados).length, resultados });
  }
  return json({ erro: "informe lead_id ou pendentes" }, 400);
});
