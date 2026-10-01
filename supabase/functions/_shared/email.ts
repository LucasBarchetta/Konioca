// Envio genérico por Resend (convite do plano B, base antiga, alertas, avisos do painel). A Circular tem módulo próprio.
// Chave mestra config.envios_ativos: com false, nada sai por aqui, com uma única exceção: aviso interno (painel de
// aprovação e Monitor técnico) para um e-mail da lista config.painel_aprovadores. Leads e base antiga continuam bloqueados.
// Rastreio de abertura e clique fica desligado (nada de tracking no payload; o domínio no Resend também fica sem).
import { carregarConfig, cfgBool, cfgText, pendente } from "./config.ts";
import { excecaoInterna } from "./aprovadores.ts";
import { emailBloqueado, motivoBloqueio } from "./bloqueio.ts";

export async function enviarEmail(para: string, assunto: string, texto: string, html: string, tag: string): Promise<{ ok: boolean; id?: string; motivo?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, motivo: "RESEND_API_KEY ausente" };
  const { todos } = await carregarConfig();
  if (!cfgBool(todos, "envios_ativos", false)) {
    if (!excecaoInterna(todos, para, tag)) return { ok: false, motivo: "envios pausados (config.envios_ativos)" };
    console.log("envios_ativos=false: exceção interna do painel para", para);
  }
  const from = cfgText(todos, "email_from");
  if (!from || pendente(from)) return { ok: false, motivo: "config.email_from pendente" };
  // Endereço devolvido ou marcado como spam: nada sai, em nenhum tipo de envio.
  const bloqueio = await emailBloqueado(para);
  if (bloqueio.bloqueado) return { ok: false, motivo: motivoBloqueio(bloqueio) };
  const replyTo = cfgText(todos, "email_reply_to");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [para], reply_to: replyTo && !pendente(replyTo) ? replyTo : undefined, subject: assunto, text: texto, html, tags: [{ name: "tipo", value: tag }] }),
  });
  const j = await r.json().catch(() => ({})) as { id?: string };
  if (!r.ok) return { ok: false, motivo: "resend " + r.status };
  return { ok: true, id: j.id };
}
