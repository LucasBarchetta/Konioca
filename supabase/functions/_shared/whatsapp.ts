// WhatsApp Cloud API (Meta), direto ou pela 360dialog (coexistência com o app, decisão de 1/10). Única forma de
// WhatsApp permitida no projeto. Envio de template, texto, botões e áudio; verificação do webhook; parse dos eventos.
// Chave mestra config.envios_ativos: com false, nenhuma mensagem sai.
// Segredos: WHATSAPP_PROVEDOR ("meta" ou "360dialog"), WHATSAPP_TOKEN (token da Meta ou chave D360-API-KEY),
// WHATSAPP_PHONE_NUMBER_ID (só Meta), WHATSAPP_APP_SECRET e WHATSAPP_VERIFY_TOKEN (só Meta), WHATSAPP_WEBHOOK_SEGREDO (só 360dialog).
import { normalizarWhatsapp } from "./validacao.ts";
import { carregarConfig, cfgBool } from "./config.ts";
import { BASE_360, cabecalhosAuth, configuradoCom, enderecoEnvio, provedorDe, segredoUrlOk, urlWebhook } from "./whatsapp_regras.ts";

export function provedor() { return provedorDe(Deno.env.get("WHATSAPP_PROVEDOR")); }

function env(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`${nome} ausente`);
  return v;
}

export interface EnvioResultado { ok: boolean; wamid?: string; erro?: string; codigo?: number }

export function whatsappConfigurado(): boolean {
  return configuradoCom(provedor(), Deno.env.get("WHATSAPP_TOKEN"), Deno.env.get("WHATSAPP_PHONE_NUMBER_ID"));
}

async function postMensagem(corpo: Record<string, unknown>): Promise<EnvioResultado> {
  if (!whatsappConfigurado()) return { ok: false, erro: "WHATSAPP_TOKEN (e WHATSAPP_PHONE_NUMBER_ID na Meta) ausentes", codigo: -1 };
  const { todos } = await carregarConfig();
  if (!cfgBool(todos, "envios_ativos", false)) return { ok: false, erro: "envios pausados (config.envios_ativos)", codigo: -2 };
  const r = await fetch(enderecoEnvio(provedor(), Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? ""), {
    method: "POST",
    headers: cabecalhosAuth(provedor(), env("WHATSAPP_TOKEN")),
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...corpo }),
  });
  const j = await r.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message?: string; code?: number; error_data?: { details?: string } } };
  if (!r.ok) return { ok: false, erro: j.error?.error_data?.details ?? j.error?.message ?? `http ${r.status}`, codigo: j.error?.code };
  return { ok: true, wamid: j.messages?.[0]?.id };
}

export function paraWaId(e164: string): string { return e164.replace(/\D/g, ""); }

/** Template aprovado na Meta. params = variáveis do corpo na ordem; botaoUrlSufixo = variável do botão de URL dinâmica. */
export function enviarTemplate(e164: string, nome: string, idioma: string, params: string[], botaoUrlSufixo?: string): Promise<EnvioResultado> {
  const components: Record<string, unknown>[] = [];
  if (params.length) components.push({ type: "body", parameters: params.map((t) => ({ type: "text", text: t })) });
  if (botaoUrlSufixo !== undefined) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: botaoUrlSufixo }] });
  return postMensagem({ to: paraWaId(e164), type: "template", template: { name: nome, language: { code: idioma }, components } });
}

/** Texto livre: só dentro da janela de 24h após a última mensagem do lead. */
export function enviarTexto(e164: string, texto: string): Promise<EnvioResultado> {
  return postMensagem({ to: paraWaId(e164), type: "text", text: { body: texto, preview_url: false } });
}

/** Botões de resposta (até 3), dentro da janela. */
export function enviarBotoes(e164: string, texto: string, botoes: { id: string; titulo: string }[]): Promise<EnvioResultado> {
  return postMensagem({
    to: paraWaId(e164), type: "interactive",
    interactive: { type: "button", body: { text: texto }, action: { buttons: botoes.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.titulo.slice(0, 20) } })) } },
  });
}

/** Áudio pré-gravado da Marcela (media id já enviado à Meta), dentro da janela. */
export function enviarAudio(e164: string, mediaId: string): Promise<EnvioResultado> {
  return postMensagem({ to: paraWaId(e164), type: "audio", audio: { id: mediaId } });
}

export async function marcarLida(wamid: string): Promise<void> {
  try {
    await fetch(enderecoEnvio(provedor(), Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? ""), {
      method: "POST", headers: cabecalhosAuth(provedor(), env("WHATSAPP_TOKEN")),
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: wamid }),
    });
  } catch { /* melhor esforço */ }
}

/** 360dialog: registra a URL do nosso webhook (com o segredo) na conta deles. Só com o provedor 360dialog. */
export async function registrarWebhook360(): Promise<{ ok: boolean; url?: string; erro?: string }> {
  if (provedor() !== "360dialog") return { ok: false, erro: "WHATSAPP_PROVEDOR não é 360dialog" };
  const segredo = Deno.env.get("WHATSAPP_WEBHOOK_SEGREDO") ?? "";
  if (segredo.length < 16) return { ok: false, erro: "WHATSAPP_WEBHOOK_SEGREDO ausente ou curto (mínimo 16)" };
  const url = urlWebhook(Deno.env.get("SUPABASE_URL") ?? "", segredo);
  const r = await fetch(`${BASE_360}/v1/configs/webhook`, { method: "POST", headers: cabecalhosAuth("360dialog", env("WHATSAPP_TOKEN")), body: JSON.stringify({ url }) });
  if (!r.ok) return { ok: false, erro: `360dialog ${r.status}: ${(await r.text()).slice(0, 200)}` };
  return { ok: true, url: url.replace(segredo, "[segredo]") };
}

// ---- Webhook ---------------------------------------------------------------

/** Meta: assinatura X-Hub-Signature-256 com o app secret. 360dialog: segredo nosso na URL (eles não assinam). */
export function verificarWebhook(req: Request, corpo: string): Promise<boolean> {
  if (provedor() === "360dialog") return Promise.resolve(segredoUrlOk(req.url, Deno.env.get("WHATSAPP_WEBHOOK_SEGREDO")));
  return verificarAssinaturaMeta(req, corpo);
}

export async function verificarAssinaturaMeta(req: Request, corpo: string): Promise<boolean> {
  const segredo = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
  const cab = req.headers.get("x-hub-signature-256") ?? "";
  if (!segredo || !cab.startsWith("sha256=")) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(corpo)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  const esperado = cab.slice(7);
  if (hex.length !== esperado.length) return false;
  let r = 0;
  for (let i = 0; i < hex.length; i++) r |= hex.charCodeAt(i) ^ esperado.charCodeAt(i);
  return r === 0;
}

export interface MensagemRecebida {
  wamid: string; de: string; e164: string | null; nome: string | null; quando: string;
  tipo: string; texto: string; botaoId: string | null; contextoWamid: string | null; bruto: unknown;
}
export interface StatusRecebido { wamid: string; status: string; quando: string; erro: string | null; codigo: number | null; bruto: unknown }

/** Extrai mensagens e status do payload do webhook (várias entradas por chamada). O formato é o mesmo na Meta e na
 *  360dialog. Em coexistência, o que o time manda pelo app chega como eco (value.message_echoes) e é ignorado aqui:
 *  não é mensagem do lead nem envio nosso. */
export function parseWebhook(payload: unknown): { mensagens: MensagemRecebida[]; status: StatusRecebido[] } {
  const mensagens: MensagemRecebida[] = [];
  const status: StatusRecebido[] = [];
  const p = payload as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] };
  for (const entry of p.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {};
      const contatos = (v.contacts as { wa_id?: string; profile?: { name?: string } }[] | undefined) ?? [];
      for (const m of (v.messages as Record<string, unknown>[] | undefined) ?? []) {
        const de = String(m.from ?? "");
        const norm = normalizarWhatsapp(de);
        const tipo = String(m.type ?? "");
        let texto = "", botaoId: string | null = null;
        if (tipo === "text") texto = String((m.text as { body?: string })?.body ?? "");
        else if (tipo === "button") { texto = String((m.button as { text?: string })?.text ?? ""); botaoId = String((m.button as { payload?: string })?.payload ?? "") || null; }
        else if (tipo === "interactive") {
          const it = m.interactive as { type?: string; button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
          const r = it?.button_reply ?? it?.list_reply;
          texto = String(r?.title ?? ""); botaoId = r?.id ?? null;
        }
        const ts = Number(m.timestamp ?? 0);
        mensagens.push({
          wamid: String(m.id ?? ""), de, e164: norm.ok ? norm.e164 : null,
          nome: contatos.find((c) => c.wa_id === de)?.profile?.name ?? null,
          quando: ts ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
          tipo, texto, botaoId, contextoWamid: (m.context as { id?: string })?.id ?? null, bruto: m,
        });
      }
      for (const s of (v.statuses as Record<string, unknown>[] | undefined) ?? []) {
        const ts = Number(s.timestamp ?? 0);
        const err = (s.errors as { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] | undefined)?.[0];
        status.push({
          wamid: String(s.id ?? ""), status: String(s.status ?? ""),
          quando: ts ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
          erro: err ? (err.error_data?.details ?? err.message ?? err.title ?? null) : null, codigo: err?.code ?? null, bruto: s,
        });
      }
    }
  }
  return { mensagens, status };
}
