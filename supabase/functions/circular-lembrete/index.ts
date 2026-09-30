// POST /circular-lembrete — (cron, chave de serviço) lembra por e-mail quem não confirmou o recebimento
// da Circular em config.circular_lembrete_horas. Um lembrete por lead. Na etapa 2 o agente repete pelo WhatsApp.
// Inclui o grupo de controle: a confirmação é ato do processo legal, não mensagem de venda.
import { db, exigirServico } from "../_shared/db.ts";
import { carregarConfig, cfgNum } from "../_shared/config.ts";
import { json } from "../_shared/http.ts";
import { enviarLembreteCircular } from "../_shared/circular.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!exigirServico(req)) return json({ erro: "não autorizado" }, 401);
  const { todos } = await carregarConfig();
  const horas = cfgNum(todos, "circular_lembrete_horas", 48);
  const { data: leads, error } = await db().rpc("leads_para_lembrete_circular", { p_horas: horas, p_limite: 200 });
  if (error) return json({ erro: error.message }, 500);
  let enviados = 0; const falhas: Record<string, string> = {};
  for (const l of (leads ?? []) as { id: string; nome: string; email: string; token: string }[]) {
    const r = await enviarLembreteCircular(l);
    if (r.ok) enviados++; else { falhas[l.id] = r.motivo ?? "erro"; if (/RESEND_API_KEY|email_from/.test(r.motivo ?? "")) break; }
  }
  return json({ ok: true, candidatos: leads?.length ?? 0, enviados, falhas });
});
