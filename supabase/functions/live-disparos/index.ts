// Disparos ligados à live (cron a cada 5 min), idempotentes pela tabela disparos:
// - lembrete 1h antes com o link (variante com a pergunta só se foi selecionada)
// - gravação no dia seguinte, na hora configurada, para quem não assistiu, com a mesma pergunta
import { db, exigirServico } from "../_shared/db.ts";
import { carregarConfig, cfgNum, cfgText } from "../_shared/config.ts";
import { json } from "../_shared/http.ts";

function chaveDia(iso: string): string { return iso.slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401);
  const sb = db();
  const { todos: cfg } = await carregarConfig();
  const agora = Date.now();
  const turmas = (cfg["turmas"] as { nome: string; live: string }[] | undefined) ?? [];
  const saida: Record<string, unknown> = {};

  for (const t of turmas) {
    const live = new Date(t.live).getTime();
    if (!live) continue;
    const antesMs = cfgNum(cfg, "lembrete_live_min_antes", 60) * 60_000;

    // Lembrete: janela de 10 min a partir de (live - N min)
    const chaveL = `lembrete_live:${t.nome}:${chaveDia(t.live)}`;
    if (agora >= live - antesMs && agora < live - antesMs + 10 * 60_000) {
      const { data: feito } = await sb.from("disparos").select("chave").eq("chave", chaveL).maybeSingle();
      if (!feito) {
        const { data: leads } = await sb.from("leads").select("id, pergunta_live").eq("turma", t.nome).is("optout_em", null).eq("grupo_controle", false).not("convidado_em", "is", null);
        const { data: sel } = await sb.from("perguntas_live").select("lead_id").eq("selecionada", true);
        const selecionados = new Set((sel ?? []).map((s) => s.lead_id));
        let n = 0;
        for (const l of leads ?? []) {
          await sb.rpc("fila_enfileirar", { p_lead: l.id, p_tipo: selecionados.has(l.id) && l.pergunta_live ? "lembrete_live_pergunta" : "lembrete_live", p_quando: new Date().toISOString() });
          n++;
        }
        await sb.from("disparos").insert({ chave: chaveL, total: n });
        saida[chaveL] = n;
      }
    }

    // Gravação: dia seguinte à live, na hora configurada (São Paulo), para quem não assistiu
    const [gh, gm] = cfgText(cfg, "gravacao_hora", "10:00").split(":").map(Number);
    const diaSeg = new Date(live + 24 * 3600_000);
    const alvo = new Date(diaSeg.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) + `T${String(gh).padStart(2, "0")}:${String(gm || 0).padStart(2, "0")}:00-03:00`).getTime();
    const chaveG = `gravacao:${t.nome}:${chaveDia(t.live)}`;
    if (agora >= alvo && agora < alvo + 30 * 60_000) {
      const { data: feito } = await sb.from("disparos").select("chave").eq("chave", chaveG).maybeSingle();
      if (!feito) {
        const { data: leads } = await sb.from("leads").select("id").eq("turma", t.nome).is("optout_em", null).eq("grupo_controle", false).not("convidado_em", "is", null).is("assistiu_em", null);
        let n = 0;
        for (const l of leads ?? []) { await sb.rpc("fila_enfileirar", { p_lead: l.id, p_tipo: "gravacao", p_quando: new Date().toISOString() }); n++; }
        await sb.from("disparos").insert({ chave: chaveG, total: n });
        saida[chaveG] = n;
      }
    }
  }
  return json({ ok: true, ...saida });
});
