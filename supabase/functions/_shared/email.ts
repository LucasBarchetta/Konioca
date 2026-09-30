// Envio genérico por Resend (convite do plano B, base antiga, alertas). A Circular tem módulo próprio.
import { carregarConfig, cfgText, pendente } from "./config.ts";

export async function enviarEmail(para: string, assunto: string, texto: string, html: string, tag: string): Promise<{ ok: boolean; id?: string; motivo?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, motivo: "RESEND_API_KEY ausente" };
  const { todos } = await carregarConfig();
  const from = cfgText(todos, "email_from");
  if (!from || pendente(from)) return { ok: false, motivo: "config.email_from pendente" };
  const replyTo = cfgText(todos, "email_reply_to");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [para], reply_to: replyTo && !pendente(replyTo) ? replyTo : undefined, subject: assunto, text: texto, html, tags: [{ name: "tipo", value: tag }] }),
  });
  const j = await r.json().catch(() => ({})) as { id?: string };
  if (!r.ok) return { ok: false, motivo: "resend " + r.status };
  return { ok: true, id: j.id };
}
