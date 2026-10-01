// POST /painel-avisar — (interno, chave de serviço) avisa por e-mail os aprovadores dos itens pendentes ainda não
// avisados, com o link assinado de cada um (tag "painel": sai pela exceção interna mesmo com envios_ativos = false).
// Corpo: { email?: "<só este aprovador>" } avisa dos itens; { link_para: "<e-mail>" } manda só o link de acesso
// (decisão de 1/10: link do painel nunca passa pelo chat, só por e-mail para quem está em painel_aprovadores).
import { db, exigirServico } from "../_shared/db.ts";
import { carregarConfig } from "../_shared/config.ts";
import { json, lerJson } from "../_shared/http.ts";
import { aprovadores } from "../_shared/aprovadores.ts";
import { enviarEmail } from "../_shared/email.ts";

function esc(s: string): string { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string)); }

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401);
  const b = (await lerJson<{ email?: string; link_para?: string }>(req)) ?? {};
  const { todos: cfg } = await carregarConfig();
  const sb = db();
  const apiUrl0 = (Deno.env.get("SUPABASE_URL") ?? "") + "/functions/v1";
  if (b.link_para) {
    const a = aprovadores(cfg).find((x) => x.email.toLowerCase() === String(b.link_para).toLowerCase());
    if (!a) return json({ erro: "e-mail fora de painel_aprovadores" }, 400);
    const r0 = await fetch(`${apiUrl0}/painel-api`, { method: "POST", headers: { "content-type": "application/json", authorization: req.headers.get("authorization") ?? "" }, body: JSON.stringify({ acao: "link", email: a.email }) });
    const link = (await r0.json().catch(() => ({}))) as { url?: string };
    if (!link.url) return json({ erro: "sem link" }, 500);
    const texto = [`${a.nome}, este é o seu acesso ao painel da pré-venda da Konioca.`, ``, `Abrir o painel: ${link.url}`, ``, `O link é pessoal: toda ação no painel fica registrada com o seu nome. Não repasse. Se o link parar de funcionar, peça um novo.`].join("\n");
    const html = `<p style="font-family:Carlito,Calibri,sans-serif;font-size:16px">${esc(a.nome)}, este é o seu acesso ao painel da pré-venda da Konioca.</p><p><a href="${link.url}" style="display:inline-block;padding:14px 22px;background:#b04d0c;color:#f7f0e2;font-family:Carlito,Calibri,sans-serif;font-size:17px;font-weight:700;text-decoration:none;border-radius:7px">Abrir o painel</a></p><p style="font-family:Carlito,Calibri,sans-serif;font-size:13px;color:#5a6b3a">O link é pessoal: toda ação no painel fica registrada com o seu nome. Não repasse. Se o link parar de funcionar, peça um novo.</p>`;
    const r = await enviarEmail(a.email, "[Konioca] Seu acesso ao painel da pré-venda", texto, html, "painel");
    return json({ ok: r.ok, para: a.email, motivo: r.motivo ?? null });
  }
  const { data: itens } = await sb.from("aprovacoes").select("id, tipo, titulo, aprovador, criado_em").eq("status", "pendente").is("avisado_em", null).order("criado_em");
  if (!itens?.length) return json({ ok: true, avisados: {}, itens: 0 });
  const apiUrl = (Deno.env.get("SUPABASE_URL") ?? "") + "/functions/v1";
  const chave = req.headers.get("authorization") ?? "";
  const avisados: Record<string, string> = {};
  for (const a of aprovadores(cfg)) {
    if (b.email && a.email.toLowerCase() !== b.email.toLowerCase()) continue;
    const meus = itens.filter((i) => i.aprovador === a.papel || a.papel === "principal");
    if (!meus.length) continue;
    const r0 = await fetch(`${apiUrl}/painel-api`, { method: "POST", headers: { "content-type": "application/json", authorization: chave }, body: JSON.stringify({ acao: "link", email: a.email }) });
    const link = (await r0.json().catch(() => ({}))) as { url?: string };
    if (!link.url) { avisados[a.email] = "sem link"; continue; }
    const quantos = meus.length === 1 ? "há 1 item" : "há " + meus.length + " itens";
    const linhas = meus.map((i) => `${i.titulo} (${i.tipo})`);
    const texto = [`${a.nome}, ${quantos} esperando a sua aprovação no painel da Konioca.`, ``, ...linhas.map((l) => "- " + l), ``, `Abrir o painel: ${link.url}`, ``, `Esse link é seu, não repasse.`].join("\n");
    const html = `<p style="font-family:Carlito,Calibri,sans-serif;font-size:16px">${esc(a.nome)}, ${quantos} esperando a sua aprovação no painel da Konioca.</p><ul style="font-family:Carlito,Calibri,sans-serif;font-size:16px">${linhas.map((l) => "<li>" + esc(l) + "</li>").join("")}</ul><p><a href="${link.url}" style="display:inline-block;padding:14px 22px;background:#b04d0c;color:#f7f0e2;font-family:Carlito,Calibri,sans-serif;font-size:17px;font-weight:700;text-decoration:none;border-radius:7px">Abrir o painel</a></p><p style="font-family:Carlito,Calibri,sans-serif;font-size:13px;color:#5a6b3a">Esse link é seu, não repasse.</p>`;
    const r = await enviarEmail(a.email, `[Konioca] ${meus.length === 1 ? "1 item" : meus.length + " itens"} para aprovar`, texto, html, "painel");
    avisados[a.email] = r.ok ? "enviado" : (r.motivo ?? "falhou");
    if (r.ok) await sb.from("aprovacoes").update({ avisado_em: new Date().toISOString() }).in("id", meus.map((i) => i.id));
  }
  return json({ ok: true, itens: itens.length, avisados });
});
