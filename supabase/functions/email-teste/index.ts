// POST /email-teste — (interno, chave de serviço) manda a prévia de um e-mail de lead só para um aprovador do painel,
// pela exceção interna (tag "teste"), sem mexer em envios_ativos.
// Corpo: { tipo?: "convite" | "base_antiga_email" | "base_antiga_email2", para?: "<e-mail>", imagens_url?: "<base>", prioridade?: "P1", gancho?: "fev/26", variante?: "a" | "b" }.
// tipo "texto": { para, assunto, texto } manda um aviso interno em texto puro para um endereço de painel_aprovadores
// (ex.: a fórmula nova da planilha, gerada no banco, que nunca passa pelo chat). Não grava em mensagens: o corpo pode ter segredo.
// imagens_url troca a base das imagens só neste teste (prévia do Pages antes de mesclar em main).
// Sem "para", vai para os aprovadores com papel "principal". Nunca manda para quem não está em painel_aprovadores.
import { db, exigirServico } from "../_shared/db.ts";
import { carregarConfig, type Config } from "../_shared/config.ts";
import { json, lerJson } from "../_shared/http.ts";
import { acharAprovador, aprovadores } from "../_shared/aprovadores.ts";
import { montarEnvio, type LeadFila } from "../_shared/fila.ts";
import { enviarEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401);
  const b = (await lerJson<{ tipo?: string; para?: string; imagens_url?: string; prioridade?: string; gancho?: string; variante?: string; assunto?: string; texto?: string }>(req)) ?? {};
  const tipo = b.tipo ?? "convite";
  if (tipo !== "convite" && tipo !== "base_antiga_email" && tipo !== "base_antiga_email2" && tipo !== "texto") return json({ erro: "tipo não suportado: " + tipo }, 400);
  const { todos } = await carregarConfig();
  if (tipo === "texto") {
    const para = String(b.para ?? "").trim().toLowerCase();
    if (!para || !acharAprovador(todos, para)) return json({ erro: "destinatário fora da lista de aprovadores" }, 400);
    const assunto = String(b.assunto ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 150);
    const texto = String(b.texto ?? "").trim();
    if (!assunto || !texto) return json({ erro: "assunto e texto obrigatórios" }, 400);
    const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const html = `<p style="font-family:Carlito,Calibri,sans-serif;font-size:16px;white-space:pre-wrap">${esc(texto)}</p>`;
    const r = await enviarEmail(para, "[Konioca] " + assunto, texto, html, "teste");
    return json({ ok: r.ok, tipo, motivo: r.motivo ?? null });
  }
  if (b.imagens_url && /^https:\/\/[a-z0-9.-]+\.(konioca\.com|pages\.dev)(\/|$)/i.test(b.imagens_url)) todos["email_imagens_url"] = b.imagens_url;
  const lista = aprovadores(todos);
  const destinos = b.para ? lista.filter((a) => a.email.toLowerCase() === String(b.para).toLowerCase()) : lista.filter((a) => a.papel === "principal");
  if (!destinos.length) return json({ erro: "destinatário fora da lista de aprovadores" }, 400);
  const apiUrl = (Deno.env.get("SUPABASE_URL") ?? "") + "/functions/v1";
  const sb = db();
  const resultados: Record<string, string> = {};
  for (const a of destinos) {
    const leadFicticio: LeadFila = { id: "teste", nome: a.nome, whatsapp: a.whatsapp ?? "", email: a.email, token: "teste", turma: null, pergunta_live: null, estado_conversa: "inicio", base_antiga_prioridade: b.prioridade ?? "P1", base_antiga_gancho: b.gancho ?? "fev/26", base_antiga_variante: b.variante ?? null };
    const envio = montarEnvio(tipo, "email", leadFicticio, todos as Config, apiUrl);
    if (envio.canal !== "email") { resultados[a.email] = "não montou: " + ("motivo" in envio ? envio.motivo : envio.canal); continue; }
    const r = await enviarEmail(a.email, "[TESTE" + (tipo === "base_antiga_email" ? " " + (b.prioridade ?? "P1") + (b.variante ? " " + String(b.variante).toUpperCase() : "") : tipo === "base_antiga_email2" ? " 2º E-MAIL" : "") + "] " + envio.assunto, envio.texto, envio.html, "teste");
    await sb.from("mensagens").insert({ lead_id: null, canal: "email", direcao: "out", tipo: "teste", modelo: tipo, corpo: envio.texto, provedor_id: r.id ?? null, status: r.ok ? "enviado" : "falhou", erro: r.motivo ?? null, iniciada_pela_empresa: true });
    resultados[a.email] = r.ok ? "enviado " + (r.id ?? "") : (r.motivo ?? "falhou");
  }
  return json({ ok: true, tipo, resultados });
});
