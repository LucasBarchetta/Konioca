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

// Domínios de e-mail com erro de digitação comum -> domínio certo. Só sugestão: a página pergunta "Você quis dizer…?"
// e a pessoa decide com um toque; nada é corrigido sozinho (decisão de 1/10, depois do caso hotmail.co).
const DOMINIOS_CORRIGIDOS: Record<string, string> = {
  "hotmail.co": "hotmail.com", "hotmail.con": "hotmail.com", "hotmail.cm": "hotmail.com", "hotmail.om": "hotmail.com", "hotmail.comm": "hotmail.com",
  "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmial.com": "hotmail.com", "homail.com": "hotmail.com", "hotmil.com": "hotmail.com", "hotamil.com": "hotmail.com",
  "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gmail.om": "gmail.com", "gmail.comm": "gmail.com", "gmail.com.br": "gmail.com", "gmail.co.br": "gmail.com",
  "gmai.com": "gmail.com", "gmial.com": "gmail.com", "gamil.com": "gmail.com", "gmaill.com": "gmail.com", "gnail.com": "gmail.com", "gmali.com": "gmail.com", "gemail.com": "gmail.com", "gmeil.com": "gmail.com",
  "outlook.co": "outlook.com", "outlook.con": "outlook.com", "outlook.cm": "outlook.com", "outlok.com": "outlook.com", "outllok.com": "outlook.com", "outloo.com": "outlook.com", "oulook.com": "outlook.com",
  "yahoo.con": "yahoo.com", "yahoo.co": "yahoo.com", "yahoo.cm": "yahoo.com", "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.com.b": "yahoo.com.br", "yahoo.con.br": "yahoo.com.br",
  "icloud.con": "icloud.com", "icloud.co": "icloud.com", "iclod.com": "icloud.com", "icould.com": "icloud.com", "live.con": "live.com", "live.co": "live.com",
  "uol.com": "uol.com.br", "uol.con.br": "uol.com.br", "uol.com.b": "uol.com.br", "bol.com": "bol.com.br", "bol.con.br": "bol.com.br", "terra.com": "terra.com.br", "terra.con.br": "terra.com.br", "ig.com": "ig.com.br",
};
const DOMINIOS_CERTOS: ReadonlySet<string> = new Set(Object.values(DOMINIOS_CORRIGIDOS).concat(["msn.com", "me.com", "globo.com", "protonmail.com", "proton.me", "hotmail.com.br", "outlook.com.br", "live.com.br"]));

/** Sugestão de e-mail corrigido ("ana@hotmail.co" -> "ana@hotmail.com"), ou null quando não há o que sugerir. Nunca altera sozinho. */
export function sugerirEmail(entrada: string): string | null {
  const e = String(entrada ?? "").trim().toLowerCase();
  const arroba = e.lastIndexOf("@");
  if (arroba < 1 || arroba === e.length - 1) return null;
  const usuario = e.slice(0, arroba), dominio = e.slice(arroba + 1);
  if (DOMINIOS_CERTOS.has(dominio)) return null;
  let certo = DOMINIOS_CORRIGIDOS[dominio] ?? null;
  if (!certo) {
    // Terminações trocadas em qualquer domínio: ".con", ".cmo", ".coom" -> ".com"; ".con.br", ".com.b" -> ".com.br".
    if (/\.con\.br$/.test(dominio) || /\.com\.b$/.test(dominio)) certo = dominio.replace(/\.con\.br$|\.com\.b$/, ".com.br");
    else if (/\.(con|cmo|coom|comm|vom|xom)$/.test(dominio)) certo = dominio.replace(/\.(con|cmo|coom|comm|vom|xom)$/, ".com");
  }
  if (!certo || certo === dominio) return null;
  return usuario + "@" + certo;
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
