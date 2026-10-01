// POST /email-teste — (interno, chave de serviço) manda a prévia de um e-mail de lead só para um aprovador do painel,
// pela exceção interna (tag "teste"), sem mexer em envios_ativos. Corpo: { tipo?: "convite", para?: "<e-mail>" }.
// Sem "para", vai para os aprovadores com papel "principal". Nunca manda para quem não está em painel_aprovadores.
import { db, exigirServico } from "../_shared/db.ts";
import { carregarConfig, type Config } from "../_shared/config.ts";
import { json, lerJson } from "../_shared/http.ts";
import { aprovadores } from "../_shared/aprovadores.ts";
import { montarEnvio, type LeadFila } from "../_shared/fila.ts";
import { enviarEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401);
  const b = (await lerJson<{ tipo?: string; para?: string }>(req)) ?? {};
  const tipo = b.tipo ?? "convite";
  if (tipo !== "convite") return json({ erro: "tipo não suportado: " + tipo }, 400);
  const { todos } = await carregarConfig();
  const lista = aprovadores(todos);
  const destinos = b.para ? lista.filter((a) => a.email.toLowerCase() === String(b.para).toLowerCase()) : lista.filter((a) => a.papel === "principal");
  if (!destinos.length) return json({ erro: "destinatário fora da lista de aprovadores" }, 400);
  const apiUrl = (Deno.env.get("SUPABASE_URL") ?? "") + "/functions/v1";
  const sb = db();
  const resultados: Record<string, string> = {};
  for (const a of destinos) {
    const leadFicticio: LeadFila = { id: "teste", nome: a.nome, whatsapp: a.whatsapp, email: a.email, token: "teste", turma: null, pergunta_live: null, estado_conversa: "inicio" };
    const envio = montarEnvio(tipo, "email", leadFicticio, todos as Config, apiUrl);
    if (envio.canal !== "email") { resultados[a.email] = "não montou: " + ("motivo" in envio ? envio.motivo : envio.canal); continue; }
    const r = await enviarEmail(a.email, "[TESTE] " + envio.assunto, envio.texto, envio.html, "teste");
    await sb.from("mensagens").insert({ lead_id: null, canal: "email", direcao: "out", tipo: "teste", modelo: tipo, corpo: envio.texto, provedor_id: r.id ?? null, status: r.ok ? "enviado" : "falhou", erro: r.motivo ?? null, iniciada_pela_empresa: true });
    resultados[a.email] = r.ok ? "enviado " + (r.id ?? "") : (r.motivo ?? "falhou");
  }
  return json({ ok: true, tipo, resultados });
});
