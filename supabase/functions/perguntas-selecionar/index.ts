// Seleção de perguntas para a Marcela responder ao vivo (cron diário e sob demanda).
// Usa a API do Claude quando há chave; senão, heurística. Marca selecionada_por = 'agente';
// o que um humano marcou ('humano') nunca é sobrescrito. Corpo opcional: { turma, qtd }.
import { db, exigirServico } from "../_shared/db.ts";
import { carregarConfig, cfgNum, cfgText } from "../_shared/config.ts";
import { json, lerJson } from "../_shared/http.ts";
import { selecionarPerguntas, type PerguntaCandidata } from "../_shared/claude.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401);
  const b = await lerJson<{ turma?: string; qtd?: number }>(req);
  const sb = db();
  const { todos: cfg } = await carregarConfig();
  const qtd = b?.qtd ?? cfgNum(cfg, "perguntas_live_qtd", 8);

  let q = sb.from("perguntas_live").select("id, lead_id, texto, nome, cidade, selecionada, selecionada_por, leads!inner(tem_negocio, nota, optout_em)");
  if (b?.turma) q = q.eq("turma", b.turma);
  const { data: linhas, error } = await q;
  if (error) return json({ erro: error.message }, 500);

  const candidatas: PerguntaCandidata[] = [];
  const fixas: string[] = [];
  for (const p of (linhas ?? []) as unknown as { id: number; lead_id: string; texto: string; nome: string; cidade: string | null; selecionada: boolean; selecionada_por: string | null; leads: { tem_negocio: boolean | null; nota: number; optout_em: string | null } }[]) {
    if (p.leads?.optout_em) continue;
    if (p.selecionada && p.selecionada_por === "humano") { fixas.push(p.lead_id); continue; }
    candidatas.push({ lead_id: p.lead_id, nome: p.nome, cidade: p.cidade, texto: p.texto, tem_negocio: p.leads?.tem_negocio ?? null, nota: Number(p.leads?.nota ?? 0) });
  }
  const restantes = Math.max(0, qtd - fixas.length);
  const r = await selecionarPerguntas(candidatas, restantes, cfgText(cfg, "claude_modelo", "claude-opus-5-5"));

  // Reaplica a seleção do agente sem tocar nas do humano
  await sb.from("perguntas_live").update({ selecionada: false, ordem: null, motivo: null, selecionada_por: null }).eq("selecionada_por", "agente");
  let ordem = fixas.length;
  for (const s of r.selecionadas) {
    ordem++;
    await sb.from("perguntas_live").update({ selecionada: true, ordem, motivo: s.motivo, selecionada_por: "agente" }).eq("lead_id", s.lead_id);
  }
  return json({ ok: true, fonte: r.fonte, fixas_humano: fixas.length, selecionadas_agente: r.selecionadas.length, candidatas: candidatas.length, observacao: r.observacao });
});
