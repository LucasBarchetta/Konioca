// Base antiga (cron a cada 30 min): WhatsApp em lotes pequenos depois do e-mail, uma tentativa por pessoa.
//   P2 (email_depois_whatsapp_lotes): por decisão de 30/09, só quem clicou no e-mail (config.base_antiga_p2_regra = "se_clicar").
//        Com "lotes", volta à regra da planilha: entra nos lotes N horas depois do e-mail, quem clicou primeiro.
//   P3/P4 (email_whatsapp_se_clicar): só quem clicou no e-mail.
// Nunca: sem celular válido, e-mail devolvido, quem saiu, grupo de controle, quem já se cadastrou pela LP.
// Com a fila pausada por qualidade do número, não enfileira nada.
import { db, exigirServico } from "../_shared/db.ts";
import { carregarConfig, cfgNum, cfgText } from "../_shared/config.ts";
import { json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401);
  const sb = db();
  const { todos: cfg } = await carregarConfig();

  const { data: pausa } = await sb.from("alertas").select("id").eq("tipo", "fila_pausada").eq("status", "aberto").maybeSingle();
  if (pausa) return json({ ok: true, pausado: true });

  const lote = Math.max(1, Math.floor(cfgNum(cfg, "wa_base_antiga_por_hora", 30) / 2)); // roda 2x por hora
  const aposHoras = cfgNum(cfg, "base_antiga_whatsapp_apos_horas", 48);
  const p2EmLotes = cfgText(cfg, "base_antiga_p2_regra", "se_clicar") === "lotes";
  const corte = new Date(Date.now() - aposHoras * 3600_000).toISOString();

  // Leads da base com e-mail enviado (não devolvido). Quem clicou vai na hora; a espera de N horas vale só no modo "lotes".
  const { data: emails } = await sb.from("mensagens").select("lead_id, status, criado_em")
    .eq("canal", "email").eq("modelo", "base_antiga_email").in("status", ["enviado", "entregue", "lido"])
    .order("criado_em", { ascending: true }).limit(3000);
  const antigo = new Set((emails ?? []).filter((m) => m.criado_em < corte).map((m) => m.lead_id));
  const ids = [...new Set((emails ?? []).map((m) => m.lead_id).filter(Boolean))] as string[];
  if (!ids.length) return json({ ok: true, candidatos: 0, enfileirados: 0 });

  const { data: cliques } = await sb.from("lead_eventos").select("lead_id").eq("tipo", "email_clicado").in("lead_id", ids);
  const clicou = new Set((cliques ?? []).map((c) => c.lead_id));
  const { data: jaWa } = await sb.from("fila_envios").select("lead_id").eq("tipo", "base_antiga").in("lead_id", ids);
  const tentou = new Set((jaWa ?? []).map((f) => f.lead_id));
  const { data: leads } = await sb.from("leads").select("id, base_antiga, base_antiga_canal, optout_em, wa_invalido_em, whatsapp, grupo_controle, base_antiga_convertido_em")
    .in("id", ids);

  const candidatos = (leads ?? []).filter((l) =>
    l.base_antiga && !l.optout_em && !l.wa_invalido_em && l.whatsapp && !l.grupo_controle && !l.base_antiga_convertido_em && !tentou.has(l.id) &&
    (clicou.has(l.id) || (p2EmLotes && l.base_antiga_canal === "email_depois_whatsapp_lotes" && antigo.has(l.id))));
  candidatos.sort((a, b) => Number(clicou.has(b.id)) - Number(clicou.has(a.id)));

  let n = 0;
  for (const l of candidatos.slice(0, lote)) {
    await sb.rpc("fila_enfileirar", { p_lead: l.id, p_tipo: "base_antiga", p_quando: new Date().toISOString() });
    n++;
  }
  return json({ ok: true, candidatos: candidatos.length, enfileirados: n, clicaram: candidatos.filter((l) => clicou.has(l.id)).length });
});
