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

/** Canal de origem do lead (primeiro toque, mesma gaveta da aba Desempenho: v_painel_leads.canal) -> etiqueta. */
export const CANAIS: readonly { canal: string; rotulo: string }[] = [
  { canal: "stories", rotulo: "Stories" }, { canal: "bio_instagram", rotulo: "Bio do Instagram" }, { canal: "bio_tiktok", rotulo: "Bio do TikTok" },
  { canal: "whatsapp", rotulo: "WhatsApp" }, { canal: "base_p1", rotulo: "E-mail base antiga P1" }, { canal: "base_p2", rotulo: "E-mail base antiga P2" },
  { canal: "base_p34", rotulo: "E-mail base antiga P3-P4" }, { canal: "base_email", rotulo: "E-mail base antiga" }, { canal: "convite", rotulo: "Convite" },
  { canal: "direto", rotulo: "Direto" }, { canal: "outros", rotulo: "Outros" },
];

export function rotuloCanal(canal: string | null | undefined): string {
  return CANAIS.find((c) => c.canal === (canal ?? "outros"))?.rotulo ?? "Outros";
}

/** O que aparece ao tocar na etiqueta: o link específico (utm_content, ex.: roteiro de vídeo) e os UTMs crus. */
export function detalheCanal(l: { utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; utm_content?: string | null }): string {
  const crus = [l.utm_source, l.utm_medium, l.utm_campaign].map((x) => String(x ?? "").trim()).filter(Boolean).join(" / ");
  const link = String(l.utm_content ?? "").trim();
  return (link ? `Link: ${link}` : "Sem link específico") + (crus ? ` · ${crus}` : " · sem UTM");
}

export function filtrarCanal<T extends { canal?: string | null }>(leads: T[], canal: string): T[] {
  if (!canal || canal === "todos") return leads;
  return leads.filter((l) => (l.canal ?? "outros") === canal);
}

/** Canais presentes na lista visível, na ordem de CANAIS, com contagem (para os botões do filtro). */
export function canaisPresentes(leads: { canal?: string | null }[]): { canal: string; rotulo: string; n: number }[] {
  const n: Record<string, number> = {};
  for (const l of leads) { const c = l.canal ?? "outros"; n[c] = (n[c] ?? 0) + 1; }
  return CANAIS.filter((c) => n[c.canal]).map((c) => ({ ...c, n: n[c.canal] }));
}

/** Temperatura (regra no banco: lead_temperatura). Aqui só rótulo, filtro e ordem (quentes primeiro, depois mais novo). */
export const TEMPERATURAS: readonly { temp: string; rotulo: string }[] = [{ temp: "quente", rotulo: "Quente" }, { temp: "morno", rotulo: "Morno" }, { temp: "frio", rotulo: "Frio" }];
const ORDEM_TEMP: Record<string, number> = { quente: 0, morno: 1, frio: 2 };

export function rotuloTemperatura(t: string | null | undefined): string {
  return TEMPERATURAS.find((x) => x.temp === t)?.rotulo ?? "Frio";
}

export function filtrarTemperatura<T extends { temperatura?: string | null }>(leads: T[], temp: string): T[] {
  if (!temp || temp === "todas") return leads;
  return leads.filter((l) => (l.temperatura ?? "frio") === temp);
}

/** Quentes primeiro; dentro de cada grupo, quem tem negócio; depois o mais novo. */
export function ordenarPorTemperatura<T extends { temperatura?: string | null; criado_em?: string | null; tem_negocio?: boolean | null }>(leads: T[]): T[] {
  return [...leads].sort((a, b) =>
    (ORDEM_TEMP[a.temperatura ?? "frio"] ?? 2) - (ORDEM_TEMP[b.temperatura ?? "frio"] ?? 2) ||
    Number(b.tem_negocio === true) - Number(a.tem_negocio === true) ||
    String(b.criado_em ?? "").localeCompare(String(a.criado_em ?? "")));
}

export function temperaturasPresentes(leads: { temperatura?: string | null }[]): { temp: string; rotulo: string; n: number }[] {
  const n: Record<string, number> = {};
  for (const l of leads) { const t = l.temperatura ?? "frio"; n[t] = (n[t] ?? 0) + 1; }
  return TEMPERATURAS.map((t) => ({ ...t, n: n[t.temp] ?? 0 }));
}
