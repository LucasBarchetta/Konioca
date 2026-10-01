// Regras puras do painel da Fase A. Testadas no Node.

/** Quantidade do botão "Reservou": inteiro de 1 a 10. */
export function quantidadeValida(q: unknown): number | null {
  const n = typeof q === "number" ? q : Number(String(q ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 10) return null;
  return n;
}

/** Texto do estado de cobrança, a partir da view v_lead_cobranca (regra no banco; aqui só a frase). */
export function textoCobranca(l: { circular_confirmada_em?: string | null; liberado_em?: string | null; pode_cobrar?: boolean | null; dias_faltam?: number | null }): { texto: string; tom: "verde" | "cinza" | "vermelho" } {
  if (!l.circular_confirmada_em) return { texto: "Circular não confirmada", tom: "vermelho" };
  if (l.pode_cobrar) return { texto: "Pode cobrar desde " + ddmm(l.liberado_em), tom: "verde" };
  const d = l.dias_faltam ?? 0;
  return { texto: d <= 1 ? "Falta 1 dia" : `Faltam ${d} dias`, tom: "cinza" };
}

export function ddmm(iso?: string | null, timeZone = "America/Sao_Paulo"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const f = new Intl.DateTimeFormat("en-US", { timeZone, day: "2-digit", month: "2-digit" });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return `${p.day}/${p.month}`;
}

/** "Reservou" só com pode cobrar (regra do banco em lead_reservar; aqui o estado do botão). */
export function botaoReservar(l: { circular_confirmada_em?: string | null; liberado_em?: string | null; pode_cobrar?: boolean | null; dias_faltam?: number | null; reservou_em?: string | null; optout_em?: string | null }): { ativo: boolean; texto: string } {
  if (l.reservou_em || l.optout_em) return { ativo: false, texto: "Reservou" };
  if (l.pode_cobrar) return { ativo: true, texto: "Reservou" };
  return { ativo: false, texto: textoCobranca(l).texto };
}

/** Nome curto de quem agiu, para registrar nos eventos: "Lucas (principal)". */
export function assinaturaAprovador(a: { nome?: string; papel?: string; email?: string }): string {
  const nome = (a.nome ?? "").trim() || (a.email ?? "").split("@")[0] || "time";
  return a.papel ? `${nome} (${a.papel})` : nome;
}

/** Filtros da lista: cada um exclui o que não interessa ao time naquela hora. */
export function filtrarLeads<T extends { pode_cobrar?: boolean | null; circular_confirmada_em?: string | null; reservou_em?: string | null; contato_manual_em?: string | null; optout_em?: string | null; base_antiga?: boolean }>(leads: T[], filtro: string): T[] {
  switch (filtro) {
    case "pode_cobrar": return leads.filter((l) => !!l.pode_cobrar && !l.reservou_em && !l.optout_em);
    case "sem_circular": return leads.filter((l) => !l.circular_confirmada_em && !l.optout_em);
    case "reservados": return leads.filter((l) => !!l.reservou_em);
    case "contatados": return leads.filter((l) => !!l.contato_manual_em);
    case "sairam": return leads.filter((l) => !!l.optout_em);
    case "base_antiga": return leads.filter((l) => !!l.base_antiga);
    default: return leads.filter((l) => !l.base_antiga);
  }
}
