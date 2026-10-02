// POST /lead-intake — cadastro na lista da pré-venda.
// Valida, bloqueia duplicado, registra consentimento e UTMs, sorteia grupo de controle,
// envia a Circular por e-mail (em segundo plano) e devolve o token do lead para a página de obrigado.
// Turnstile: token inválido recusa. Token ausente (selo não carregou, cache antigo, bloqueador) ou Cloudflare fora do ar:
// aceita e marca "sem verificação", com limite por IP mais apertado. Nunca perder cadastro legítimo.
// Planilha em tempo real, API de Conversões da Meta e Events API do TikTok rodam em segundo plano e nunca seguram o cadastro.
import { db, exigirServico } from "../_shared/db.ts";
import { carregarConfig, cfgBool, cfgText } from "../_shared/config.ts";
import { verificarTurnstile } from "../_shared/turnstile.ts";
import { enviarLeadCapi } from "../_shared/meta_capi.ts";
import { enviarLeadTiktok } from "../_shared/tiktok_events.ts";
import { corsHeaders, ipDe, json, lerJson } from "../_shared/http.ts";
import { classificarOrigem, limparTexto, normalizarWhatsapp, validarEmail, validarNome } from "../_shared/validacao.ts";
import { enviarCircular } from "../_shared/circular.ts";
import { enviarLinhaPlanilha, linhaTempoReal, planilhaConfigurada } from "../_shared/planilha_tempo_real.ts";

interface Entrada {
  nome?: string; whatsapp?: string; email?: string; cidade?: string; tem_negocio?: boolean | string | null;
  consentimento?: boolean; consentimento_texto?: string;
  utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string;
  fbclid?: string; gclid?: string; ttclid?: string; referrer?: string; landing_url?: string;
  site?: string; // honeypot: humano deixa vazio
  turnstile_token?: string; turnstile_estado?: string;
  fbp?: string; fbc?: string;
  monitor?: boolean; // cadastro de teste do Monitor técnico: só com a chave de serviço; pula planilha, Circular e pixels
}

const TEXTO_CONSENTIMENTO_PADRAO = "Aceito receber mensagens da Konioca no WhatsApp e por e-mail sobre a pré-venda. Posso sair quando quiser.";

/** Planilha em tempo real: registra a linha (durável) e tenta enviar na hora; o cron planilha-processar cobre as falhas. */
async function planilhaTempoReal(leadId: string) {
  const sb = db();
  const { data: l } = await sb.from("leads").select("criado_em, nome, whatsapp, email, cidade, tem_negocio, origem, utm_source, utm_medium, bloqueado_em").eq("id", leadId).single();
  if (!l) return;
  const { data: envio } = await sb.from("planilha_envios").insert({ lead_id: leadId }).select("id").single();
  if (!planilhaConfigurada()) return; // fica pendente até os segredos existirem
  const r = await enviarLinhaPlanilha(linhaTempoReal(l));
  if (r.ok) await sb.from("planilha_envios").update({ status: "enviado", tentativas: 1, enviado_em: new Date().toISOString() }).eq("id", envio!.id);
  else await sb.from("planilha_envios").update({ tentativas: 1, motivo: r.motivo ?? null, proximo_em: new Date(Date.now() + 5 * 60_000).toISOString() }).eq("id", envio!.id);
}

Deno.serve(async (req) => {
  const cors = await corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ erro: "método" }, 405, cors);

  const b = await lerJson<Entrada>(req);
  if (!b) return json({ erro: "corpo inválido" }, 400, cors);

  // Honeypot: bots preenchem; humanos não veem o campo.
  if (b.site && String(b.site).trim() !== "") return json({ ok: true, novo: false, token: null }, 200, cors);

  const erros: Record<string, string> = {};
  const nome = validarNome(b.nome);
  if (!nome.ok) erros.nome = nome.motivo;
  const whats = normalizarWhatsapp(String(b.whatsapp ?? ""));
  if (!whats.ok) erros.whatsapp = whats.motivo;
  const email = validarEmail(String(b.email ?? ""));
  if (!email.ok) erros.email = email.motivo;
  if (b.consentimento !== true) erros.consentimento = "Precisamos do seu aceite para enviar o link do encontro.";
  if (Object.keys(erros).length) return json({ erro: "validação", campos: erros }, 422, cors);
  if (!nome.ok || !whats.ok || !email.ok) return json({ erro: "validação" }, 422, cors);

  const ip = ipDe(req);
  const sb = db();
  const { todos } = await carregarConfig();
  const monitorTeste = b.monitor === true && (await exigirServico(req));

  // Turnstile: antes de gravar e antes de qualquer disparo.
  // Com token: inválido recusa; Cloudflare indisponível aceita e marca. Sem token: aceita e marca (limite por IP apertado).
  let semVerificacao: string | null = null;
  if (cfgBool(todos, "turnstile_ativo", false) && !monitorTeste) {
    const token = String(b.turnstile_token ?? "").trim();
    if (!token) {
      semVerificacao = "token ausente (" + limparTexto(b.turnstile_estado, 30).replace(/[^a-z_]/g, "") + ")";
      console.warn("turnstile sem token, cadastro aceito sem verificação:", semVerificacao);
    } else {
      const t = await verificarTurnstile(token, ip);
      if (t.status === "recusado") {
        console.warn("turnstile recusado", t.motivo);
        return json({ erro: "Não deu para confirmar que você não é um robô. Recarregue a página e tente de novo." }, 403, cors);
      }
      if (t.status === "indisponivel") { semVerificacao = t.motivo; console.error("turnstile indisponível, cadastro aceito sem verificação:", t.motivo); }
    }
  }

  // Limite por IP: o normal, e um mais apertado para quem chega sem o selo verificado.
  const lim = (todos[semVerificacao ? "cadastro_limite_ip_sem_selo" : "cadastro_limite_ip"] as { janela_min?: number; max?: number } | undefined) ?? {};
  if (ip && !monitorTeste) {
    const { data: dentro } = await sb.rpc("rate_limit_hit", { p_chave: (semVerificacao ? "cadastro-sem-selo:" : "cadastro:") + ip, p_janela_min: lim.janela_min ?? (semVerificacao ? 30 : 10), p_max: lim.max ?? (semVerificacao ? 3 : 8) });
    if (dentro === false) return json({ erro: "Muitas tentativas. Tente de novo em alguns minutos." }, 429, cors);
  }

  let temNegocio: boolean | null = null;
  if (b.tem_negocio === true || b.tem_negocio === "sim") temNegocio = true;
  if (b.tem_negocio === false || b.tem_negocio === "nao") temNegocio = false;

  const rastreio = {
    utm_source: limparTexto(b.utm_source, 100) || null,
    utm_medium: limparTexto(b.utm_medium, 100) || null,
    utm_campaign: limparTexto(b.utm_campaign, 150) || null,
    utm_content: limparTexto(b.utm_content, 150) || null,
    utm_term: limparTexto(b.utm_term, 150) || null,
    fbclid: limparTexto(b.fbclid, 200) || null,
    gclid: limparTexto(b.gclid, 200) || null,
    ttclid: limparTexto(b.ttclid, 200) || null,
    referrer: limparTexto(b.referrer, 500) || null,
    landing_url: limparTexto(b.landing_url, 1000) || null,
    fbp: limparTexto(b.fbp, 100) || null,
    fbc: limparTexto(b.fbc, 200) || null,
  };

  const payload = {
    nome: nome.nome,
    whatsapp: whats.e164,
    email: email.email,
    cidade: limparTexto(b.cidade, 100) || null,
    tem_negocio: temNegocio,
    consentimento_texto: limparTexto(b.consentimento_texto, 400) || TEXTO_CONSENTIMENTO_PADRAO,
    ip: ip || null,
    user_agent: limparTexto(req.headers.get("user-agent"), 300) || null,
    origem: classificarOrigem(rastreio),
    ...rastreio,
  };

  const { data, error } = await sb.rpc("lead_cadastrar", { p: payload });
  if (error) {
    console.error("lead_cadastrar", error);
    return json({ erro: "Não deu para salvar agora. Tente de novo." }, 500, cors);
  }
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) return json({ erro: "Não deu para salvar agora. Tente de novo." }, 500, cors);

  if (r.novo && monitorTeste) {
    // Teste do Monitor: fica marcado no lead e não dispara nada (planilha, Circular, pixels, APIs de conversão).
    await sb.from("leads").update({ monitor_teste: true }).eq("id", r.lead_id);
    await sb.from("lead_eventos").insert({ lead_id: r.lead_id, tipo: "monitor_teste", origem: "sistema" });
  } else if (r.novo) {
    // Tudo abaixo roda em segundo plano: o cadastro não espera provedores. Cada tarefa engole o próprio erro.
    const tarefas: Promise<unknown>[] = [
      enviarCircular(r.lead_id).catch((e) => console.error("enviarCircular", e)),
      planilhaTempoReal(r.lead_id).catch((e) => console.error("planilha", e)),
    ];
    if (semVerificacao) {
      tarefas.push(Promise.resolve(sb.from("lead_eventos").insert({ lead_id: r.lead_id, tipo: "cadastro_sem_verificacao", origem: "sistema", dados: { motivo: semVerificacao } })).catch((e: unknown) => console.error("sem_verificacao", e)));
    }
    if (cfgBool(todos, "meta_capi_ativo", false)) {
      tarefas.push(enviarLeadCapi(cfgText(todos, "meta_pixel_id"), {
        event_id: r.lead_id, email: email.email, whatsappE164: whats.e164, nome: nome.nome, cidade: payload.cidade,
        ip, userAgent: payload.user_agent ?? "", url: rastreio.landing_url, fbp: rastreio.fbp, fbc: rastreio.fbc, fbclid: rastreio.fbclid, quandoMs: Date.now(),
      }, cfgText(todos, "meta_test_event_code")).then(async (c) => {
        if (c.ok) await sb.from("leads").update({ capi_enviado_em: new Date().toISOString() }).eq("id", r.lead_id);
        else console.warn("capi", c.motivo); // sem token, pula em silêncio
      }).catch((e) => console.error("capi", e)));
    }
    if (cfgBool(todos, "tiktok_eapi_ativo", false)) {
      tarefas.push(enviarLeadTiktok(cfgText(todos, "tiktok_pixel_id"), {
        event_id: r.lead_id, email: email.email, whatsappE164: whats.e164, ip, userAgent: payload.user_agent ?? "",
        url: rastreio.landing_url, ttclid: rastreio.ttclid, quandoMs: Date.now(),
      }).then((c) => { if (!c.ok) console.warn("tiktok", c.motivo); }).catch((e) => console.error("tiktok", e)));
    }
    const tarefa = Promise.all(tarefas);
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(tarefa); else await tarefa;
  }

  const lpUrl = cfgText(todos, "lp_url");
  return json({
    ok: true,
    novo: r.novo,
    token: r.token,
    event_id: r.lead_id, // mesmo id no pixel (eventID) e nas APIs de conversão: deduplicação
    grupo_controle: r.grupo_controle,
    obrigado_url: `${lpUrl.replace(/\/$/, "")}/obrigado.html?t=${encodeURIComponent(r.token)}&n=${r.novo ? 1 : 0}`,
  }, r.novo ? 201 : 200, cors);
});
