// POST /encontro-escolher — página /horario/ (formato de 2/10: encontros fechados no Google Meet). Pública, CORS da LP,
// identificada pelo token do lead (nunca pelo id). Corpo: { t, acao: "listar" | "escolher", encontro_id? }.
// listar: primeiro nome, turma atual (com o link do Meet, só dela) e as opções com vaga (turma cheia some).
// escolher: grava a turma (regra no banco: encontro_escolher), que já enfileira a confirmação por e-mail com o .ics
// e os lembretes da véspera e de 1 h antes. Nada é enviado por aqui.
import { db } from "../_shared/db.ts";
import { corsHeaders, ipDe, json, lerJson } from "../_shared/http.ts";
import { limparTexto } from "../_shared/validacao.ts";
import { primeiroNome } from "../_shared/conversa.ts";

Deno.serve(async (req) => {
  const cors = await corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ erro: "método" }, 405, cors);
  const b = (await lerJson<{ t?: string; acao?: string; encontro_id?: number }>(req)) ?? {};
  const token = limparTexto(b.t, 64);
  const acao = limparTexto(b.acao, 16) || "listar";
  if (!token || token.length < 20) return json({ erro: "Abra esta página pelo link do seu e-mail." }, 400, cors);
  const sb = db();
  const { data: dentro } = await sb.rpc("rate_limit_hit", { p_chave: "horario:" + ipDe(req), p_janela_min: 10, p_max: 60 });
  if (dentro === false) return json({ erro: "Muitas tentativas. Aguarde alguns minutos." }, 429, cors);

  if (acao === "escolher") {
    const id = Number(b.encontro_id);
    if (!Number.isInteger(id) || id <= 0) return json({ erro: "Escolha um horário." }, 400, cors);
    const { data, error } = await sb.rpc("encontro_escolher", { p_token: token, p_encontro: id });
    if (error) return json({ erro: "Não deu para salvar agora. Tente de novo." }, 500, cors);
    const r = Array.isArray(data) ? data[0] : data;
    if (!r?.ok) return json({ ok: false, erro: r?.motivo === "turma cheia" ? "Essa turma acabou de lotar. Escolha outro horário." : r?.motivo === "horário indisponível" ? "Esse horário não está mais disponível." : "Link inválido. Abra pelo e-mail que você recebeu." }, 409, cors);
    return json({ ok: true, atual: { id: r.enc_id, inicio: r.enc_inicio, duracao_min: r.enc_duracao, meet_link: r.enc_link } }, 200, cors);
  }

  const { data: lead } = await sb.from("leads").select("id, nome, optout_em, encontro_id, encontro:encontros(id, inicio, duracao_min, meet_link, ativo)").eq("token", token).maybeSingle();
  if (!lead) return json({ erro: "Link inválido. Abra pelo e-mail que você recebeu." }, 404, cors);
  if (lead.optout_em) return json({ erro: "Este contato pediu para sair da lista." }, 410, cors);
  const { data: opcoes } = await sb.rpc("encontros_disponiveis");
  const en = lead.encontro as unknown as { id: number; inicio: string; duracao_min: number; meet_link: string | null; ativo: boolean } | null;
  return json({
    ok: true, nome: primeiroNome(lead.nome),
    atual: en && en.ativo ? { id: en.id, inicio: en.inicio, duracao_min: en.duracao_min, meet_link: en.meet_link } : null,
    opcoes: (opcoes ?? []) as { id: number; inicio: string; duracao_min: number; vagas: number }[],
  }, 200, cors);
});
