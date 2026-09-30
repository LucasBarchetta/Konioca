// GET /optout?t=TOKEN — "Sair": interrompe toda automação para o lead. Um clique, sem confirmação extra.
import { db } from "../_shared/db.ts";
import { html, paginaSimples } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = (url.searchParams.get("t") ?? "").slice(0, 64);
  if (!token) return html(paginaSimples("Link inválido", "Esse link não é válido."), 400);
  const sb = db();
  const { data: lead } = await sb.from("leads").select("id, optout_em").eq("token", token).maybeSingle();
  if (!lead) return html(paginaSimples("Link inválido", "Não encontramos seu cadastro por esse link."), 404);
  if (!lead.optout_em) {
    await sb.from("leads").update({ optout_em: new Date().toISOString(), optout_motivo: "link_email", status_funil: "saiu" }).eq("id", lead.id);
    await sb.from("lead_eventos").insert({ lead_id: lead.id, tipo: "optout", origem: "lead", dados: { canal: "email" } });
  }
  return html(paginaSimples("Pronto.", "Você não recebe mais mensagens da pré-venda. Se mudar de ideia, é só se cadastrar de novo."));
});
