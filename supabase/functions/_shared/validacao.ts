// Regras puras de validação e classificação. Sem dependências: rodam no Deno (functions),
// no Node (testes) e no navegador (site/assets/js/validacao.js é gerado deste arquivo).

// DDDs em uso no Brasil (Anatel). 
export const DDDS_VALIDOS: ReadonlySet<number> = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export type ResultadoWhatsapp =
  | { ok: true; e164: string; ddd: number; nacional: string }
  | { ok: false; motivo: string };

/**
 * Normaliza um WhatsApp brasileiro para E.164 (+55DDDNÚMERO).
 * Aceita máscaras, +55, 0 de operadora e celular com ou sem o 9 (o 9 é adicionado).
 * Recusa DDD inexistente e número fixo (celular obrigatório para WhatsApp).
 */
export function normalizarWhatsapp(entrada: string): ResultadoWhatsapp {
  let d = String(entrada ?? "").replace(/\D+/g, "");
  if (!d) return { ok: false, motivo: "Informe o WhatsApp com DDD." };
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("0") && d.length >= 11) d = d.slice(1);
  if (d.length === 10) {
    // DDD + 8 dígitos: celular antigo sem o 9. Fixos (2-5) não têm WhatsApp.
    const primeiro = d[2];
    if (!/[6-9]/.test(primeiro)) return { ok: false, motivo: "Use um número de celular com DDD." };
    d = d.slice(0, 2) + "9" + d.slice(2);
  }
  if (d.length !== 11) return { ok: false, motivo: "O WhatsApp precisa ter DDD e 9 dígitos." };
  const ddd = Number(d.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) return { ok: false, motivo: "DDD não existe." };
  if (d[2] !== "9") return { ok: false, motivo: "Use um número de celular (começa com 9)." };
  if (/^(\d)\1{8}$/.test(d.slice(2))) return { ok: false, motivo: "Número inválido." };
  return { ok: true, e164: "+55" + d, ddd, nacional: d };
}

export function formatarWhatsapp(e164: string): string {
  const d = e164.replace(/\D+/g, "").replace(/^55/, "");
  if (d.length !== 11) return e164;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function validarEmail(entrada: string): { ok: true; email: string } | { ok: false; motivo: string } {
  const e = String(entrada ?? "").trim().toLowerCase();
  if (!e) return { ok: false, motivo: "Informe o e-mail." };
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return { ok: false, motivo: "E-mail inválido." };
  return { ok: true, email: e };
}

export function limparTexto(entrada: unknown, max = 120): string {
  // deno-lint-ignore no-control-regex
  return String(entrada ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function validarNome(entrada: unknown): { ok: true; nome: string } | { ok: false; motivo: string } {
  const n = limparTexto(entrada, 80);
  if (n.length < 2) return { ok: false, motivo: "Informe seu nome." };
  if (!/[a-zà-ú]/i.test(n)) return { ok: false, motivo: "Informe seu nome." };
  return { ok: true, nome: n };
}

export interface Rastreio {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  referrer?: string | null;
}

export type Origem = "marcela_conteudo" | "base_propria" | "trafego_pago" | "indicacao" | "direto" | "outro";

/**
 * Classifica a origem do lead. Regra simples e explícita; o painel agrupa por ela.
 * Prioridade: gclid ou utm_medium pago > fbclid/ttclid sem utm_medium orgânico > utm_source conhecido > referrer > direto.
 * O Instagram e o TikTok põem fbclid/ttclid em todo clique de saída, inclusive bio e stories; por isso um
 * utm_medium orgânico dos links oficiais (docs/08) vence o identificador de clique. O gclid só existe em anúncio.
 */
const MEDIO_ORGANICO = /^(bio|stories|story|post|reels|mensagem|organico|organic|social)$/;

export function classificarOrigem(r: Rastreio): Origem {
  const src = (r.utm_source ?? "").toLowerCase();
  const med = (r.utm_medium ?? "").toLowerCase();
  const ref = (r.referrer ?? "").toLowerCase();
  if (r.gclid) return "trafego_pago";
  if (/^(cpc|cpm|paid|ads|paid_social|pago)$/.test(med)) return "trafego_pago";
  if ((r.fbclid || r.ttclid) && !MEDIO_ORGANICO.test(med)) return "trafego_pago";
  if (/^(base|email|e-mail|whatsapp|lista|crm|newsletter)$/.test(src) || /^(base|email|whatsapp)$/.test(med)) return "base_propria";
  if (/^(indicacao|indicação|referral|amigo)$/.test(src) || med === "referral") return "indicacao";
  if (/^(instagram|ig|tiktok|youtube|yt|facebook|fb|reels|bio|linktree|marcela)$/.test(src)) return "marcela_conteudo";
  if (/instagram\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com|l\.instagram\.com/.test(ref)) return "marcela_conteudo";
  if (!src && !med && !ref) return "direto";
  return "outro";
}

/** Percentual de desconto, sempre arredondado para baixo. */
export function percentualDesconto(precoAtual: number, precoNovo: number): number {
  if (!(precoAtual > 0) || !(precoNovo >= 0) || precoNovo >= precoAtual) return 0;
  return Math.floor(((precoAtual - precoNovo) / precoAtual) * 100);
}
