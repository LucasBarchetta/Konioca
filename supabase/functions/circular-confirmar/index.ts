// GET /circular-confirmar?t=TOKEN — o lead confirma que recebeu a Circular. Registra data e hora.
import { db } from "../_shared/db.ts";
import { carregarConfig, cfgText } from "../_shared/config.ts";
import { html, paginaSimples } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = (url.searchParams.get("t") ?? "").slice(0, 64);
  const { todos } = await carregarConfig();
  const grupo = cfgText(todos, "whatsapp_grupo_link");
  if (!token) return html(paginaSimples("Link inválido", "Esse link não é válido. Se você se cadastrou na pré-venda, use o link do e-mail."), 400);

  const sb = db();
  const { data: lead } = await sb.from("leads").select("id, nome, circular_confirmada_em, optout_em").eq("token", token).maybeSingle();
  if (!lead) return html(paginaSimples("Link inválido", "Não encontramos seu cadastro por esse link."), 404);

  const agora = new Date().toISOString();
  if (!lead.circular_confirmada_em) {
    await sb.rpc("circular_marca_recebimento", { p_lead: lead.id, p_evento: "confirmacao", p_quando: agora });
    await sb.from("lead_eventos").insert({ lead_id: lead.id, tipo: "circular_confirmada", origem: "lead" });
  }
  const primeiro = String(lead.nome).split(/\s+/)[0];
  return html(paginaSimples(
    `Anotado, ${primeiro}.`,
    "Registramos que você recebeu a Circular de Oferta de Franquia. Leia com calma. Qualquer pagamento só acontece depois do prazo da lei, e a gente avisa quando chegar a hora.",
    "Entrar no grupo da pré-venda", grupo,
  ));
});
