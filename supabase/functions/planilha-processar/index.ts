// POST /planilha-processar — (cron a cada 5 min, chave de serviço) reenvia à planilha em tempo real as linhas que falharam.
// Cada lead novo entra em planilha_envios no cadastro; o lead-intake tenta na hora, em segundo plano. O que ficar
// pendente é retentado aqui com espera crescente (5, 10, 15... minutos), até 20 tentativas. Nada se perde.
import { db, exigirServico } from "../_shared/db.ts";
import { json } from "../_shared/http.ts";
import { enviarLinhaPlanilha, linhaTempoReal, planilhaConfigurada } from "../_shared/planilha_tempo_real.ts";
import type { LeadPlanilha } from "../_shared/planilha.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401);
  if (!planilhaConfigurada()) return json({ ok: true, pausado: "SHEETS_WEBHOOK_URL/TOKEN ausentes", enviados: 0 });
  const sb = db();
  const { data: itens, error } = await sb.from("planilha_envios").select("id, lead_id, tentativas")
    .eq("status", "pendente").lte("proximo_em", new Date().toISOString()).order("id").limit(50);
  if (error) return json({ erro: error.message }, 500);

  let enviados = 0; const falhas: Record<string, string> = {};
  for (const it of itens ?? []) {
    const { data: l } = await sb.from("leads")
      .select("criado_em, nome, whatsapp, email, cidade, tem_negocio, origem, utm_source, utm_medium, bloqueado_em, optout_em, anonimizado_em")
      .eq("id", it.lead_id).maybeSingle();
    if (!l || l.optout_em || l.anonimizado_em) { await sb.from("planilha_envios").update({ status: "cancelado", motivo: "lead saiu ou foi anonimizado" }).eq("id", it.id); continue; }
    const r = await enviarLinhaPlanilha(linhaTempoReal(l as LeadPlanilha));
    const tentativas = it.tentativas + 1;
    if (r.ok) { await sb.from("planilha_envios").update({ status: "enviado", tentativas, enviado_em: new Date().toISOString(), motivo: null }).eq("id", it.id); enviados++; continue; }
    falhas[it.id] = r.motivo ?? "erro";
    const definitivo = tentativas >= 20;
    await sb.from("planilha_envios").update({
      status: definitivo ? "falhou" : "pendente", tentativas, motivo: r.motivo ?? null,
      proximo_em: new Date(Date.now() + tentativas * 5 * 60_000).toISOString(),
    }).eq("id", it.id);
  }
  return json({ ok: true, processados: itens?.length ?? 0, enviados, falhas });
});
