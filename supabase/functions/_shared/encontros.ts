// Textos e regras puras dos encontros fechados no Google Meet (formato de 2/10). Testado no Node.
import { partesData } from "./datas.ts";

export interface EncontroLead { id: number; inicio: string; duracao_min: number; meet_link: string | null }

/** "quinta, 15/10, às 10h" */
export function quandoEncontro(inicioIso: string): string {
  const p = partesData(inicioIso);
  return `${p.diaSemana}, ${p.ddmm}, às ${p.hora}`;
}

/** Código do Meet para o botão de URL dinâmica do WhatsApp: "abc-defg-hij" de https://meet.google.com/abc-defg-hij. */
export function codigoMeet(link: string | null | undefined): string {
  const m = String(link ?? "").match(/meet\.google\.com\/([a-z0-9-]+)/i);
  return m ? m[1] : "";
}

/** Opções agrupadas por dia (SP) para a página de escolha: [{ dia: "Quinta, 15/10", itens: [...] }]. */
export function agruparPorDia<T extends { inicio: string }>(itens: T[]): { dia: string; itens: (T & { hora: string })[] }[] {
  const grupos: { dia: string; itens: (T & { hora: string })[] }[] = [];
  for (const it of [...itens].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const p = partesData(it.inicio);
    const dia = `${p.diaSemanaCap}, ${p.ddmm}`;
    let g = grupos.find((x) => x.dia === dia);
    if (!g) { g = { dia, itens: [] }; grupos.push(g); }
    g.itens.push({ ...it, hora: p.hora });
  }
  return grupos;
}
