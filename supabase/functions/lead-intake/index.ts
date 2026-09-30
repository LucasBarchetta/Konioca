// POST /lead-intake — cadastro na lista da pré-venda.
// Valida, bloqueia duplicado, registra consentimento e UTMs, sorteia grupo de controle,
// envia a Circular por e-mail (em segundo plano) e devolve o token do lead para a página de obrigado.
import { db } from "../_shared/db.ts";
import { carregarConfig, cfgText } from "../_shared/config.ts";
import { corsHeaders, ipDe, json, lerJson } from "../_shared/http.ts";
import { classificarOrigem, limparTexto, normalizarWhatsapp, validarEmail, validarNome } from "../_shared/validacao.ts";
import { enviarCircular } from "../_shared/circular.ts";

interface Entrada {
  nome?: string; whatsapp?: string; email?: string; cidade?: string; tem_negocio?: boolean | string | null;
  consentimento?: boolean; consentimento_texto?: string;
  utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string;
  fbclid?: string; gclid?: string; ttclid?: string; referrer?: string; landing_url?: string;
  site?: string; // honeypot: humano deixa vazio
}

const TEXTO_CONSENTIMENTO_PADRAO = "Aceito receber mensagens da Konioca no WhatsApp e por e-mail sobre a pré-venda. Posso sair quando quiser.";

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
  if (b.consentimento !== true) erros.consentimento = "Precisamos do seu aceite para enviar o link da live.";
  if (Object.keys(erros).length) return json({ erro: "validação", campos: erros }, 422, cors);
  if (!nome.ok || !whats.ok || !email.ok) return json({ erro: "validação" }, 422, cors);

  const ip = ipDe(req);
  const sb = db();
  const { todos } = await carregarConfig();
  const lim = (todos["cadastro_limite_ip"] as { janela_min?: number; max?: number } | undefined) ?? {};
  if (ip) {
    const { data: dentro } = await sb.rpc("rate_limit_hit", { p_chave: "cadastro:" + ip, p_janela_min: lim.janela_min ?? 10, p_max: lim.max ?? 8 });
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

  if (r.novo) {
    // A Circular vai em segundo plano: o cadastro não espera o provedor de e-mail.
    const tarefa = enviarCircular(r.lead_id).catch((e) => console.error("enviarCircular", e));
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(tarefa); else await tarefa;
  }

  const lpUrl = cfgText(todos, "lp_url");
  return json({
    ok: true,
    novo: r.novo,
    token: r.token,
    grupo_controle: r.grupo_controle,
    obrigado_url: `${lpUrl.replace(/\/$/, "")}/obrigado.html?t=${encodeURIComponent(r.token)}&n=${r.novo ? 1 : 0}`,
  }, r.novo ? 201 : 200, cors);
});
