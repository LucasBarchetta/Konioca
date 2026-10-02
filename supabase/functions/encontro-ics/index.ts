// GET /encontro-ics?t=<token> — arquivo de agenda (.ics) da turma do lead (encontro fechado no Google Meet). Pública, pelo token.
// Substitui a live-ics (formato de 2/10). Sem turma escolhida, 404.
import { db } from "../_shared/db.ts";
import { corsHeaders } from "../_shared/http.ts";
import { icsEvento } from "../_shared/ics.ts";

Deno.serve(async (req) => {
  const cors = await corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const t = (new URL(req.url).searchParams.get("t") ?? "").trim();
  if (!t || t.length < 20) return new Response("link inválido", { status: 400, headers: cors });
  const { data: lead } = await db().from("leads").select("id, optout_em, encontro:encontros(id, inicio, duracao_min, meet_link)").eq("token", t).maybeSingle();
  const en = lead?.encontro as unknown as { id: number; inicio: string; duracao_min: number; meet_link: string | null } | null;
  if (!lead || lead.optout_em || !en) return new Response("sem horário escolhido", { status: 404, headers: cors });
  const ics = icsEvento({
    uid: `encontro-${en.id}-${lead.id}@konioca`, inicio: new Date(en.inicio), duracaoMin: en.duracao_min,
    titulo: "Konioca · encontro com a Marcela (Google Meet)",
    descricao: `Nova geração da Konioca, encontro fechado para quem está na lista.${en.meet_link ? " Link: " + en.meet_link : " O link do Meet chega por e-mail."}`,
    url: en.meet_link ?? undefined, local: "Google Meet", alarmeMin: 60,
  });
  return new Response(ics, { headers: { ...cors, "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="encontro-konioca.ics"', "cache-control": "no-store" } });
});
