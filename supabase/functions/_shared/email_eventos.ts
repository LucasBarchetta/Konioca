// Eventos do Resend (webhook) para qualquer e-mail: o que fazer com cada um. Puro e testado no Node.
// Decisões de 1/10: devolução definitiva bloqueia só o e-mail; spam encerra tudo (igual ao opt-out);
// devolução temporária só registra, e vira bloqueio na repetição (config.email_devolucao_temporaria_max em 7 dias).

export interface DadosResend {
  email_id?: string;
  to?: string[] | string;
  bounce?: { type?: string; subType?: string; message?: string };
  [k: string]: unknown;
}

export type Acao = "nenhuma" | "registrar_temporaria" | "bloquear_email" | "sair";

export interface Decisao {
  status: string | null;     // novo status da mensagem (entregue | lido | devolvido | spam) ou null para manter
  acao: Acao;
  evento: string | null;     // tipo do evento no lead
  motivo: string;            // texto curto para o lead e o painel
}

/** Classifica um evento do Resend. `bounce.type` vem como "Permanent", "Transient" ou "Undetermined". */
export function classificarEvento(tipo: string, dados: DadosResend | null | undefined): Decisao {
  const d = dados ?? {};
  if (tipo === "email.delivered") return { status: "entregue", acao: "nenhuma", evento: null, motivo: "entregue" };
  if (tipo === "email.opened" || tipo === "email.clicked") return { status: "lido", acao: "nenhuma", evento: null, motivo: tipo === "email.clicked" ? "clique" : "abertura" };
  if (tipo === "email.complained") return { status: "spam", acao: "sair", evento: "email_spam", motivo: "marcou como spam" };
  if (tipo === "email.bounced") {
    const b = d.bounce ?? {};
    const tipoDev = String(b.type ?? "").toLowerCase();
    const detalhe = [b.subType, b.message].filter(Boolean).join(": ").slice(0, 300);
    if (tipoDev === "permanent") return { status: "devolvido", acao: "bloquear_email", evento: "email_devolvido", motivo: "devolução definitiva" + (detalhe ? " (" + detalhe + ")" : "") };
    return { status: "devolvido", acao: "registrar_temporaria", evento: "email_devolucao_temporaria", motivo: "devolução temporária" + (detalhe ? " (" + detalhe + ")" : "") };
  }
  return { status: null, acao: "nenhuma", evento: null, motivo: "ignorado: " + tipo };
}

/** Endereço do destinatário no evento (primeiro de `to`), em minúsculas, ou "" se não vier. */
export function destinatarioDe(dados: DadosResend | null | undefined): string {
  const to = dados?.to;
  const v = Array.isArray(to) ? to[0] : to;
  return String(v ?? "").trim().toLowerCase();
}

/** Repetição de devolução temporária que vira bloqueio: n devoluções temporárias (contando esta) >= máximo. */
export function temporariaViraBloqueio(temporariasEm7Dias: number, maximo: number): boolean {
  return maximo > 0 && temporariasEm7Dias >= maximo;
}

/** Taxa de devolução do dia na base antiga: pausa só com amostra mínima e acima do teto. */
export function taxaDevolucaoExcedida(enviados: number, devolvidos: number, minimo: number, maxPct: number): boolean {
  if (enviados < minimo || enviados <= 0) return false;
  return (devolvidos * 100) / enviados > maxPct;
}

// Endereços do próprio time (Lucas, 6/10): devolução definitiva não bloqueia de imediato. A primeira só registra e avisa;
// o sistema tenta de novo depois de N horas (cron email-time-retentar) e só bloqueia se voltar outra vez, avisando o Lucas.
// Quem é "do time": qualquer endereço de config.painel_aprovadores (principal e cópias) ou de um domínio em config.email_time_dominios.
export type DecisaoTime = "primeira" | "mesma_queda" | "bloquear";

/** É endereço do time? `internos` = emailsInternos(cfg); `dominios` = ["konioca.com", ...], sem arroba, qualquer caixa. */
export function enderecoDoTime(email: string, internos: string[], dominios: string[]): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e.includes("@")) return false;
  if (internos.map((i) => i.toLowerCase()).includes(e)) return true;
  const dom = e.slice(e.lastIndexOf("@") + 1);
  return dominios.map((d) => String(d).trim().toLowerCase().replace(/^@/, "")).filter(Boolean).includes(dom);
}

/** `primeiraEm` = primeira devolução ainda em aberto (sem entrega depois) desse endereço, ou null.
 *  Sem devolução aberta: "primeira" (registra, avisa, não bloqueia). Dentro da janela: "mesma_queda" (só registra).
 *  Depois da janela: "bloquear" (voltou outra vez). */
export function decisaoDevolucaoTime(primeiraEm: string | Date | null | undefined, agora: Date, horas: number): DecisaoTime {
  if (!primeiraEm) return "primeira";
  const t0 = new Date(primeiraEm).getTime();
  if (Number.isNaN(t0)) return "primeira";
  const janela = Math.max(0, horas) * 3600_000;
  return agora.getTime() - t0 >= janela ? "bloquear" : "mesma_queda";
}
