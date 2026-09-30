// GET /leads-planilha?k=<chave> — CSV dos leads para o Google Sheets (IMPORTDATA), só para o time.
// A chave não fica no código nem no repositório: a config guarda só o SHA-256 dela (planilha_token_hash).
// Trocar a chave = gravar um hash novo na config; a URL antiga para de funcionar na hora.
import { carregarConfig, cfgText, pendente } from "../_shared/config.ts";
import { db } from "../_shared/db.ts";
import { csvPlanilha, iguais, sha256Hex, type LeadPlanilha } from "../_shared/planilha.ts";

const PRIVADO = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" };

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("método", { status: 405, headers: PRIVADO });
  const k = new URL(req.url).searchParams.get("k") ?? "";
  const { todos } = await carregarConfig();
  const hash = cfgText(todos, "planilha_token_hash");
  if (!k || k.length < 32 || !hash || pendente(hash) || !iguais(await sha256Hex(k), hash)) {
    return new Response("não autorizado", { status: 401, headers: PRIVADO });
  }
  const sb = db();
  const { data: dentro } = await sb.rpc("rate_limit_hit", { p_chave: "planilha", p_janela_min: 10, p_max: 120 });
  if (dentro === false) return new Response("muitas leituras", { status: 429, headers: PRIVADO });

  // A API devolve no máximo 1.000 linhas por consulta: lê em páginas até acabar.
  const leads: LeadPlanilha[] = [];
  for (let de = 0; de < 50_000; de += 1000) {
    const { data, error } = await sb.from("leads")
      .select("criado_em, nome, whatsapp, email, cidade, tem_negocio, origem, utm_source, utm_medium, bloqueado_em")
      .is("optout_em", null).is("anonimizado_em", null).order("criado_em", { ascending: false }).order("id").range(de, de + 999);
    if (error) return new Response("indisponível", { status: 500, headers: PRIVADO });
    leads.push(...((data ?? []) as LeadPlanilha[]));
    if ((data ?? []).length < 1000) break;
  }
  return new Response(csvPlanilha(leads), {
    headers: { ...PRIVADO, "content-type": "text/csv; charset=utf-8" },
  });
});
