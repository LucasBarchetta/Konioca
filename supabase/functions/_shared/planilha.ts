// Planilha de leads para o time: CSV lido pelo IMPORTDATA do Google Sheets. Puro, testado no Node.
import { formatarWhatsapp } from "./validacao.ts";

export interface LeadPlanilha {
  criado_em: string; nome: string; whatsapp: string; email: string; cidade: string | null;
  tem_negocio: boolean | null; origem: string | null; utm_source: string | null; utm_medium: string | null;
}

export const CABECALHO = ["Data", "Nome", "WhatsApp", "E-mail", "Cidade", "Tem negócio", "Origem", "Canal (UTM)"];

const ORIGENS: Record<string, string> = {
  marcela_conteudo: "Conteúdo da Marcela", base_propria: "Base própria", trafego_pago: "Tráfego pago",
  indicacao: "Indicação", direto: "Direto", outro: "Outro",
};

/** Texto digitado pelo lead nunca vira fórmula na planilha: tira =, +, -, @ e controles do começo. */
export function textoSeguro(v: unknown): string {
  return String(v ?? "").replace(/^[\s=+\-@]+/, "").replace(/[\r\n\t]+/g, " ").trim();
}

function campo(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function dataSP(iso: string): string {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso))) p[x.type] = x.value;
  // Formato ISO (aaaa-mm-dd hh:mm): o Sheets reconhece como data em qualquer idioma da planilha e mostra no formato local.
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

export function linhaPlanilha(l: LeadPlanilha): string[] {
  const canal = [l.utm_source, l.utm_medium].map(textoSeguro).filter(Boolean).join(" / ");
  return [
    dataSP(l.criado_em),
    textoSeguro(l.nome),
    formatarWhatsapp(l.whatsapp),
    textoSeguro(l.email),
    textoSeguro(l.cidade),
    l.tem_negocio === true ? "Sim" : l.tem_negocio === false ? "Não" : "",
    ORIGENS[l.origem ?? ""] ?? textoSeguro(l.origem),
    canal,
  ];
}

export function csvPlanilha(leads: LeadPlanilha[]): string {
  return [CABECALHO, ...leads.map(linhaPlanilha)].map((c) => c.map(campo).join(",")).join("\n") + "\n";
}

/** SHA-256 em hex, para comparar a chave da planilha com o hash guardado na config. */
export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
