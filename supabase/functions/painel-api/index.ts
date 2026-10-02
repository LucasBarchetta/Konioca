// POST /painel-api — painel da Fase A (docs/14). Sem login: cada aprovador tem um link assinado (token derivado
// da chave de serviço + e-mail + config.painel_links_versao). Toda ação registra quem fez. CORS da LP.
// Corpo: { t: "<token>", acao: "...", ... }. A ação "link" (gera o link de um aprovador) exige a chave de serviço.
import { db, exigirServico } from "../_shared/db.ts";
import { carregarConfig, cfgNum, cfgText, type Config } from "../_shared/config.ts";
import { corsHeaders, json, lerJson } from "../_shared/http.ts";
import { acharAprovador, aprovadores, type Aprovador } from "../_shared/aprovadores.ts";
import { assinaturaAprovador, botaoReservar, permissoesDe, podeAcao, quantidadeValida } from "../_shared/painel_regras.ts";

async function tokenDe(email: string, versao: string): Promise<string> {
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(chave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`painel:${email.trim().toLowerCase()}:${versao}`)));
  let s = ""; for (const b of sig) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 32);
}

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function aprovadorDoToken(cfg: Config, t: string): Promise<Aprovador | null> {
  if (!t || t.length < 20) return null;
  const versao = cfgText(cfg, "painel_links_versao", "1");
  for (const a of aprovadores(cfg)) {
    if (igual(await tokenDe(a.email, versao), t)) return a;
  }
  return null;
}

Deno.serve(async (req) => {
  const cors = await corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ erro: "método" }, 405, cors);
  const b = (await lerJson<Record<string, unknown>>(req)) ?? {};
  const acao = String(b.acao ?? "");
  const { todos: cfg } = await carregarConfig();
  const sb = db();

  // Gera o link assinado de um aprovador. Só com a chave de serviço (cron, operador).
  if (acao === "link") {
    if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401, cors);
    const a = acharAprovador(cfg, String(b.email ?? ""));
    if (!a) return json({ erro: "e-mail fora de painel_aprovadores" }, 400, cors);
    const base = cfgText(cfg, "painel_url", "https://prevenda.konioca.com/painel/");
    const url = String(b.base ?? base).replace(/\/?$/, "/") + "?t=" + await tokenDe(a.email, cfgText(cfg, "painel_links_versao", "1"));
    return json({ ok: true, nome: a.nome, papel: a.papel, url }, 200, cors);
  }

  const quem = await aprovadorDoToken(cfg, String(b.t ?? ""));
  if (!quem) return json({ erro: "link inválido ou vencido" }, 401, cors);
  // Permissão por papel (painel_regras.ts): a tela esconde o botão; aqui a recusa vale de verdade. "decidir" confere o item.
  if (acao !== "decidir" && !podeAcao(quem.papel, acao)) return json({ erro: "o seu papel (" + quem.papel + ") não faz esta ação: " + acao }, 403, cors);
  const por = assinaturaAprovador(quem);
  const registrar = (lead_id: string, tipo: string, dados: Record<string, unknown>) =>
    sb.from("lead_eventos").insert({ lead_id, tipo, origem: "humano", dados: { ...dados, por, em: new Date().toISOString() } });

  if (acao === "quem") {
    const { data: placar } = await sb.from("v_placar").select("leads, saidas, reservas_lote1, reservas_total").single();
    const { count: pendentes } = await sb.from("aprovacoes").select("id", { count: "exact", head: true }).eq("status", "pendente");
    return json({ ok: true, nome: quem.nome, papel: quem.papel, escopo: quem.escopo, pode: permissoesDe(quem.papel), placar: { ...(placar ?? {}), lote1_tamanho: cfgNum(cfg, "lote1_tamanho", 250) }, aprovacoes_pendentes: pendentes ?? 0, prazo_dias: cfgNum(cfg, "circular_prazo_dias", 10), agora: new Date().toISOString() }, 200, cors);
  }

  if (acao === "leads") {
    const { data, error } = await sb.from("v_painel_leads").select("*").order("criado_em", { ascending: false }).limit(2000);
    if (error) return json({ erro: error.message }, 500, cors);
    return json({ ok: true, leads: data ?? [] }, 200, cors);
  }

  if (acao === "eventos") {
    const lead_id = String(b.lead_id ?? "");
    const { data: eventos } = await sb.from("lead_eventos").select("tipo, origem, dados, criado_em").eq("lead_id", lead_id).order("criado_em", { ascending: false }).limit(40);
    const { data: mensagens } = await sb.from("mensagens").select("canal, direcao, tipo, modelo, status, erro, criado_em").eq("lead_id", lead_id).order("criado_em", { ascending: false }).limit(20);
    return json({ ok: true, eventos: eventos ?? [], mensagens: mensagens ?? [] }, 200, cors);
  }

  if (acao === "reservar") {
    const lead_id = String(b.lead_id ?? "");
    const q = quantidadeValida(b.quantidade);
    if (!q) return json({ erro: "quantidade de 1 a 10" }, 400, cors);
    // Só com "pode cobrar". O banco recusa de qualquer jeito (lead_reservar); aqui a mensagem fica clara para a tela.
    const { data: cob } = await sb.from("v_painel_leads").select("circular_confirmada_em, liberado_em, pode_cobrar, dias_faltam, reservou_em, optout_em").eq("id", lead_id).maybeSingle();
    const bt = cob ? botaoReservar(cob) : { ativo: false, texto: "lead não encontrado" };
    if (!bt.ativo) return json({ erro: "Reserva bloqueada: " + bt.texto }, 400, cors);
    const { data, error } = await sb.rpc("lead_reservar", { p_lead: lead_id, p_quantidade: q, p_por: por, p_observacao: String(b.observacao ?? "").slice(0, 300) || null });
    if (error) return json({ erro: error.message }, 400, cors);
    const r = Array.isArray(data) ? data[0] : data;
    return json({ ok: true, ...(r ?? {}) }, 200, cors);
  }

  if (acao === "reserva_cancelar") {
    const { data, error } = await sb.rpc("lead_reserva_cancelar", { p_lead: String(b.lead_id ?? ""), p_por: por, p_motivo: String(b.motivo ?? "").slice(0, 300) || null });
    if (error) return json({ erro: error.message }, 400, cors);
    return json({ ok: true, canceladas: data }, 200, cors);
  }

  if (acao === "contato_manual") {
    const { data, error } = await sb.rpc("lead_contato_manual", { p_lead: String(b.lead_id ?? ""), p_por: por });
    if (error) return json({ erro: error.message }, 400, cors);
    return json({ ok: true, convites_whatsapp_cancelados: data }, 200, cors);
  }

  if (acao === "respondeu") {
    // O time marca quem respondeu à mão no WhatsApp: sinal de lead quente por 7 dias (lead_temperatura). Só registro, nada é enviado.
    const lead_id = String(b.lead_id ?? "");
    const { data: existe } = await sb.from("leads").select("id").eq("id", lead_id).maybeSingle();
    if (!existe) return json({ erro: "lead não encontrado" }, 404, cors);
    const { error } = await registrar(lead_id, "respondeu", { canal: "whatsapp", observacao: String(b.observacao ?? "").slice(0, 300) || null });
    if (error) return json({ erro: error.message }, 400, cors);
    return json({ ok: true }, 200, cors);
  }

  if (acao === "corrigir_email") {
    const lead_id = String(b.lead_id ?? "");
    const novo = String(b.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(novo)) return json({ erro: "e-mail inválido" }, 400, cors);
    const { error } = await sb.rpc("lead_email_corrigir", { p_lead: lead_id, p_novo: novo, p_por: por });
    if (error) return json({ erro: error.message }, 400, cors);
    let reenviado = false;
    if (b.reenviar_convite === true) {
      const { error: e2 } = await sb.rpc("fila_enfileirar", { p_lead: lead_id, p_tipo: "convite", p_quando: new Date().toISOString(), p_canal: "email" });
      reenviado = !e2;
      await registrar(lead_id, "convite_reenfileirado", { canal: "email", motivo: "e-mail corrigido no painel" });
    }
    return json({ ok: true, reenviado }, 200, cors);
  }

  // Turmas dos encontros no Google Meet (formato de 2/10): lista, criar/editar, pessoas de uma turma, presença.
  if (acao === "encontros") {
    const { data, error } = await sb.from("v_encontros").select("*").order("inicio");
    if (error) return json({ erro: error.message }, 500, cors);
    return json({ ok: true, encontros: data ?? [] }, 200, cors);
  }
  if (acao === "encontro_salvar") {
    const inicio = b.inicio ? new Date(String(b.inicio)) : null;
    if (inicio && Number.isNaN(inicio.getTime())) return json({ erro: "data e hora inválidas" }, 400, cors);
    const link = b.meet_link === undefined ? null : String(b.meet_link ?? "").trim();
    if (link && !/^https:\/\/meet\.google\.com\/[a-z0-9-]+/i.test(link)) return json({ erro: "o link precisa ser https://meet.google.com/..." }, 400, cors);
    const { data, error } = await sb.rpc("encontro_salvar", {
      p_id: b.id ? Number(b.id) : null, p_inicio: inicio ? inicio.toISOString() : null,
      p_duracao: b.duracao_min != null ? Number(b.duracao_min) : null, p_capacidade: b.capacidade != null ? Number(b.capacidade) : null,
      p_meet_link: link, p_ativo: typeof b.ativo === "boolean" ? b.ativo : null, p_por: por,
    });
    if (error) return json({ erro: error.message }, 400, cors);
    const r = Array.isArray(data) ? data[0] : data;
    if (!r?.ok) return json({ erro: r?.motivo ?? "não salvou" }, 400, cors);
    return json({ ok: true, id: r.id }, 200, cors);
  }
  if (acao === "encontro_leads") {
    const id = Number(b.encontro_id);
    const { data, error } = await sb.from("v_painel_leads").select("id, nome, whatsapp, email, cidade, tem_negocio, temperatura, circular_confirmada_em, pode_cobrar, reservou_em, encontro_presenca, encontro_escolhido_em").eq("encontro_id", id).is("optout_em", null).order("nome");
    if (error) return json({ erro: error.message }, 500, cors);
    return json({ ok: true, leads: data ?? [] }, 200, cors);
  }
  if (acao === "presenca") {
    const presente = b.presente === true ? true : b.presente === false ? false : null;
    if (presente === null) return json({ erro: "presente: true ou false" }, 400, cors);
    const { error } = await sb.rpc("encontro_presenca", { p_lead: String(b.lead_id ?? ""), p_presente: presente, p_por: por });
    if (error) return json({ erro: error.message }, 400, cors);
    return json({ ok: true }, 200, cors);
  }

  if (acao === "aprovacoes") {
    const { data } = await sb.from("aprovacoes").select("*").order("criado_em", { ascending: false }).limit(100);
    const itens = (data ?? []) as Record<string, unknown>[];
    const ids = itens.map((i) => i.id as number);
    const { data: coms } = ids.length
      ? await sb.from("aprovacoes_comentarios").select("aprovacao_id, por, texto, criado_em").in("aprovacao_id", ids).order("criado_em")
      : { data: [] as { aprovacao_id: number; por: string; texto: string; criado_em: string }[] };
    const porItem = new Map<number, unknown[]>();
    for (const c of coms ?? []) porItem.set(c.aprovacao_id, [...(porItem.get(c.aprovacao_id) ?? []), c]);
    return json({ ok: true, itens: itens.map((i) => ({ ...i, comentarios: porItem.get(i.id as number) ?? [] })) }, 200, cors);
  }

  if (acao === "comentar") {
    const { data, error } = await sb.rpc("aprovacao_comentar", { p_id: Number(b.id), p_por: por, p_texto: String(b.texto ?? "").slice(0, 1000) });
    if (error) return json({ erro: error.message }, 400, cors);
    return json({ ok: true, id: data }, 200, cors);
  }

  if (acao === "propor_ab") {
    // Proposta de variação de teste A/B: vira item pendente para o principal (painel-avisar manda o aviso). Nada é enviado.
    const titulo = String(b.titulo ?? "").trim().slice(0, 200);
    const texto = String(b.texto ?? "").trim().slice(0, 4000);
    if (!titulo || !texto) return json({ erro: "título e texto da variação são obrigatórios" }, 400, cors);
    const { data, error } = await sb.rpc("aprovacao_propor", { p_tipo: "proposta_ab", p_titulo: titulo, p_conteudo: { texto, onde: String(b.onde ?? "").trim().slice(0, 200) || null, hipotese: String(b.hipotese ?? "").trim().slice(0, 500) || null }, p_aprovador: "principal", p_por: por });
    if (error) return json({ erro: error.message }, 400, cors);
    return json({ ok: true, id: data }, 200, cors);
  }

  if (acao === "decidir") {
    const { data: item } = await sb.from("aprovacoes").select("id, aprovador").eq("id", Number(b.id)).maybeSingle();
    if (!item) return json({ erro: "item não encontrado" }, 404, cors);
    if (!podeAcao(quem.papel, "decidir", item)) return json({ erro: "este item é decidido pelo papel " + item.aprovador + ", não pelo seu (" + quem.papel + ")" }, 403, cors);
    const { error } = await sb.rpc("aprovacao_decidir", { p_id: Number(b.id), p_decisao: String(b.decisao ?? ""), p_por: por, p_comentario: String(b.comentario ?? "").slice(0, 500) || null, p_conteudo_final: b.conteudo_final ?? null });
    if (error) return json({ erro: error.message }, 400, cors);
    return json({ ok: true }, 200, cors);
  }

  return json({ erro: "ação desconhecida: " + acao }, 400, cors);
});
