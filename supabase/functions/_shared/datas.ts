// Cálculos de data da pré-venda. Puros, sem dependências.

const DIA_MS = 24 * 60 * 60 * 1000;

/** Última data/hora de recebimento da Circular que ainda permite pagar dentro da pré-venda. */
export function limiteRecebimentoCircular(prevendaFimIso: string, prazoDias: number): Date {
  return new Date(new Date(prevendaFimIso).getTime() - prazoDias * DIA_MS);
}

/** Data de liberação de pagamento a partir do recebimento. */
export function liberacaoPagamento(recebidaEmIso: string, prazoDias: number): Date {
  return new Date(new Date(recebidaEmIso).getTime() + prazoDias * DIA_MS);
}

/** Um lead que receber a Circular em `agora` ainda consegue pagar antes do fim da pré-venda? */
export function aindaDaTempo(agora: Date, prevendaFimIso: string, prazoDias: number): boolean {
  return agora.getTime() <= limiteRecebimentoCircular(prevendaFimIso, prazoDias).getTime();
}

export interface PartesData {
  diaSemana: string;      // "quinta"
  diaSemanaCap: string;   // "Quinta"
  ddmm: string;           // "15/10"
  hora: string;           // "19h" ou "23h59"
  iso: string;
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Partes em pt-BR no fuso de São Paulo, para montar os textos aprovados ("Quinta, 15/10 · 19h"). */
export function partesData(iso: string, timeZone = "America/Sao_Paulo"): PartesData {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  const diaSemana = DIAS[wd] ?? "";
  const hh = p.hour === "24" ? "00" : p.hour;
  const hora = p.minute === "00" ? `${Number(hh)}h` : `${Number(hh)}h${p.minute}`;
  return {
    diaSemana,
    diaSemanaCap: diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1),
    ddmm: `${p.day}/${p.month}`,
    hora,
    iso,
  };
}

/** Formata R$ sem centavos, com ponto de milhar: 9900 -> "R$ 9.900". */
export function formatarReais(n: number): string {
  const t = String(Math.round(n));
  return "R$ " + t.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Com centavos quando houver: 3900/12 -> "R$ 325". 1234.5 -> "R$ 1.234,50". */
export function formatarReaisCentavos(n: number): string {
  const c = Math.round(n * 100);
  const r = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const d = String(c % 100);
  return "R$ " + r + (d === "0" ? "" : "," + (d.length < 2 ? "0" + d : d));
}

/** Contagem regressiva legível: "12 dias e 4 horas", "3 horas e 20 min", "encerrada". */
export function contagemRegressiva(agora: Date, fimIso: string): { encerrada: boolean; texto: string; dias: number } {
  const ms = new Date(fimIso).getTime() - agora.getTime();
  if (ms <= 0) return { encerrada: true, texto: "encerrada", dias: 0 };
  const dias = Math.floor(ms / DIA_MS);
  const horas = Math.floor((ms % DIA_MS) / (60 * 60 * 1000));
  const mins = Math.floor((ms % (60 * 60 * 1000)) / 60000);
  if (dias >= 1) return { encerrada: false, dias, texto: `${dias} ${dias === 1 ? "dia" : "dias"} e ${horas} ${horas === 1 ? "hora" : "horas"}` };
  if (horas >= 1) return { encerrada: false, dias, texto: `${horas} ${horas === 1 ? "hora" : "horas"} e ${mins} min` };
  return { encerrada: false, dias, texto: `${mins} min` };
}

/** Numeração dentro do lote: (37, 250) -> "037 de 250"; (12, null) -> "012". */
export function numeroNoLote(n: number, tamanho: number | null): string {
  const s = String(n).padStart(3, "0");
  return tamanho ? `${s} de ${tamanho}` : s;
}
