// POST /circular-webhook — eventos do Resend (entrega, abertura, clique, devolução).
// Assinatura Svix obrigatória (RESEND_WEBHOOK_SECRET). Marca o recebimento da Circular.
import { json } from "../_shared/http.ts";
import { db } from "../_shared/db.ts";
import { verificarSvix } from "../_shared/svix.ts";
import { aplicarEventoCircular } from "../_shared/circular.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  const segredo = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
  const corpo = await req.text();
  if (!(await verificarSvix(req, corpo, segredo))) return json({ erro: "assinatura inválida" }, 401);

  let ev: { type?: string; created_at?: string; data?: { email_id?: string; tags?: Record<string, string> | { name: string; value: string }[] } };
  try { ev = JSON.parse(corpo); } catch { return json({ erro: "json" }, 400); }
  const id = ev.data?.email_id;
  const tipo = ev.type ?? "";
  if (!id || !tipo) return json({ ok: true, ignorado: true });

  const quando = ev.created_at && !Number.isNaN(Date.parse(ev.created_at)) ? new Date(ev.created_at).toISOString() : new Date().toISOString();
  const aplicado = await aplicarEventoCircular(id, tipo, quando, ev.data ?? null);
  if (aplicado) return json({ ok: true, aplicado });

  // Outros e-mails (convite do plano B, base antiga): status na tabela mensagens e evento de clique para a trilha.
  const sb = db();
  const { data: m } = await sb.from("mensagens").select("id, lead_id").eq("provedor_id", id).maybeSingle();
  if (!m) return json({ ok: true, aplicado: false });
  const mapa: Record<string, string> = { "email.delivered": "entregue", "email.opened": "lido", "email.clicked": "lido", "email.bounced": "falhou", "email.complained": "falhou" };
  if (mapa[tipo]) await sb.from("mensagens").update({ status: mapa[tipo] }).eq("id", m.id);
  if (tipo === "email.clicked" && m.lead_id) await sb.from("lead_eventos").insert({ lead_id: m.lead_id, tipo: "email_clicado", origem: "lead", dados: { email_id: id } });
  return json({ ok: true, aplicado: false, mensagem: m.id });
});
