// GET /leads-planilha?k=<chave> — CSV dos leads para o Google Sheets (IMPORTDATA), só para o time.
// A chave não fica no código nem no repositório: a config guarda só o SHA-256 dela (planilha_token_hash).
// Trocar a chave = gravar um hash novo na config; a URL antiga para de funcionar na hora.
// POST com a chave de serviço e {"smoke": true} — teste de publicação: monta o CSV inteiro (mesmo caminho do GET)
// e devolve só { ok, linhas, bytes }, sem dado pessoal. Entra no teste de ponta a ponta de cada publicação (scripts/smoke.sh).
// Qualquer erro vira 500 "indisponível" em texto: o IMPORTDATA mostra "Não foi possível encontrar o URL" para 4xx/5xx,
// e um erro não tratado derrubava a function inteira (1/10: lead da base antiga sem WhatsApp).
import { carregarConfig, cfgText, pendente } from "../_shared/config.ts";
import { db, exigirServico } from "../_shared/db.ts";
import { json } from "../_shared/http.ts";
import { csvPlanilha, iguais, sha256Hex, type LeadPlanilha } from "../_shared/planilha.ts";

const PRIVADO = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" };

/** Lê a view v_leads_planilha (a API devolve no máximo 1.000 linhas por consulta: pagina até acabar) e monta o CSV.
 *  A view já aplica a decisão de 1/10 (só cadastros pela página; base antiga entra quando se cadastra, sem quem saiu)
 *  e calcula a temperatura na leitura (lead_temperatura). */
async function montarCsv(): Promise<{ csv: string; linhas: number } | { erro: string }> {
  const sb = db();
  const leads: LeadPlanilha[] = [];
  for (let de = 0; de < 50_000; de += 1000) {
    const { data, error } = await sb.from("v_leads_planilha")
      .select("criado_em, nome, whatsapp, email, cidade, tem_negocio, origem, utm_source, utm_medium, bloqueado_em, temperatura")
      .order("criado_em", { ascending: false }).order("id").range(de, de + 999);
    if (error) return { erro: "consulta: " + error.message };
    leads.push(...((data ?? []) as LeadPlanilha[]));
    if ((data ?? []).length < 1000) break;
  }
  return { csv: csvPlanilha(leads), linhas: leads.length };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "POST") {
      if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401, PRIVADO);
      const r = await montarCsv();
      if ("erro" in r) return json({ ok: false, erro: r.erro }, 500, PRIVADO);
      return json({ ok: true, linhas: r.linhas, bytes: r.csv.length }, 200, PRIVADO);
    }
    if (req.method !== "GET") return new Response("método", { status: 405, headers: PRIVADO });
    const k = new URL(req.url).searchParams.get("k") ?? "";
    const { todos } = await carregarConfig();
    const hash = cfgText(todos, "planilha_token_hash");
    if (!k || k.length < 32 || !hash || pendente(hash) || !iguais(await sha256Hex(k), hash)) {
      return new Response("não autorizado", { status: 401, headers: PRIVADO });
    }
    const { data: dentro } = await db().rpc("rate_limit_hit", { p_chave: "planilha", p_janela_min: 10, p_max: 120 });
    if (dentro === false) return new Response("muitas leituras", { status: 429, headers: PRIVADO });
    const r = await montarCsv();
    if ("erro" in r) {
      console.error("leads-planilha:", r.erro);
      return new Response("indisponível", { status: 500, headers: PRIVADO });
    }
    return new Response(r.csv, { headers: { ...PRIVADO, "content-type": "text/csv; charset=utf-8" } });
  } catch (e) {
    console.error("leads-planilha:", e instanceof Error ? e.message : String(e));
    return new Response("indisponível", { status: 500, headers: PRIVADO });
  }
});
