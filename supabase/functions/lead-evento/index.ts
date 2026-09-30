// POST /lead-evento — eventos vindos do próprio lead pelo site (intenção, clique no grupo, agenda).
// Identificado pelo token do lead (nunca pelo id). Lista fechada de tipos.
import { db } from "../_shared/db.ts";
import { corsHeaders, json, lerJson } from "../_shared/http.ts";
import { limparTexto } from "../_shared/validacao.ts";

const INTENCOES = new Set([
  "Colocar no negócio que já tenho",
  "Abrir um ponto novo",
  "Levar para academia, escola ou evento",
  "Ainda estou pesquisando",
]);
const TIPOS = new Set(["intencao", "clicou_grupo", "clicou_agenda", "viu_obrigado"]);

Deno.serve(async (req) => {
  const cors = await corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ erro: "método" }, 405, cors);

  const b = await lerJson<{ token?: string; tipo?: string; valor?: string }>(req);
  const token = limparTexto(b?.token, 64);
  const tipo = limparTexto(b?.tipo, 32);
  if (!token || !TIPOS.has(tipo)) return json({ erro: "inválido" }, 400, cors);

  const sb = db();
  const { data: lead } = await sb.from("leads").select("id, optout_em").eq("token", token).maybeSingle();
  if (!lead) return json({ erro: "não encontrado" }, 404, cors);
  if (lead.optout_em) return json({ ok: true }, 200, cors);

  if (tipo === "intencao") {
    const valor = limparTexto(b?.valor, 80);
    if (!INTENCOES.has(valor)) return json({ erro: "intenção inválida" }, 400, cors);
    await sb.from("leads").update({ intencao: valor }).eq("id", lead.id);
    await sb.from("lead_eventos").insert({ lead_id: lead.id, tipo: "intencao", origem: "lead", dados: { intencao: valor } });
    return json({ ok: true }, 200, cors);
  }

  await sb.from("lead_eventos").insert({ lead_id: lead.id, tipo, origem: "lead" });
  return json({ ok: true }, 200, cors);
});
