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
  { canal: "base_p2_a", rotulo: "E-mail base antiga P2 (A)" }, { canal: "base_p2_b", rotulo: "E-mail base antiga P2 (B)" },
  { canal: "base_p34", rotulo: "E-mail base antiga P3-P4" }, { canal: "base_p34_cones", rotulo: "E-mail base antiga P3-P4 (cones)" }, { canal: "base_p34_arte6", rotulo: "E-mail base antiga P3-P4 (arte 6)" }, { canal: "base_b2", rotulo: "E-mail base antiga 2º envio" }, { canal: "base_email", rotulo: "E-mail base antiga" }, { canal: "convite", rotulo: "Convite" },
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

// Papéis do painel (2/10 à noite, regra do Lucas): a painel-api recusa fora disso; a tela só esconde o botão.
// Quem decide cada item da aba Aprovações depende do tipo do item e de usar ou não voz ou imagem da Marcela
// (regraAprovacao). O revisor automático (revisarConteudo) barra antes de qualquer aprovação, para todo papel.
export type Papel = "principal" | "conteudo" | "operacional" | "growth";
export const PAPEIS: readonly Papel[] = ["principal", "conteudo", "operacional", "growth"];

export interface Permissoes {
  ver: boolean;              // leads, turmas, aprovações, Desempenho
  contato: boolean;          // "Contatado à mão"
  respondeu: boolean;        // "Respondeu"
  reservar: boolean;         // "Reservou" e "Desfazer reserva"
  corrigir_email: boolean;   // "Corrigir e-mail" (reenvia convite)
  turmas_editar: boolean;    // criar e editar turmas
  presenca: boolean;         // presente / faltou
  decidir: boolean;          // pode decidir algum item (qual item, decide regraAprovacao); operacional comenta, não aprova
  comentar: boolean;         // comentar em qualquer item da aba Aprovações
  propor_ab: boolean;        // propor variação de teste A/B (vira item para aprovação)
}

const TUDO: Permissoes = { ver: true, contato: true, respondeu: true, reservar: true, corrigir_email: true, turmas_editar: true, presenca: true, decidir: true, comentar: true, propor_ab: true };
const OPERACIONAL: Permissoes = { ...TUDO, decidir: false };
const GROWTH: Permissoes = { ver: true, contato: true, respondeu: true, reservar: false, corrigir_email: false, turmas_editar: false, presenca: false, decidir: true, comentar: true, propor_ab: true };
const SO_VER: Permissoes = { ver: true, contato: false, respondeu: false, reservar: false, corrigir_email: false, turmas_editar: false, presenca: false, decidir: false, comentar: false, propor_ab: false };

export function permissoesDe(papel: string | undefined | null): Permissoes {
  switch (papel) {
    case "principal": case "conteudo": return TUDO;
    case "operacional": return OPERACIONAL;
    case "growth": return GROWTH;
    default: return SO_VER; // papel desconhecido na config: só leitura, até alguém corrigir
  }
}

/** Tipos de item da aba Aprovações. Mensagens para leads ou para a base: email, whatsapp, texto. */
export type TipoAprovacao = "email" | "whatsapp" | "texto" | "roteiro_video" | "peca" | "proposta_ab" | "config";

/** Quem precisa aprovar: basta um de `qualquer_um_de` e, além disso, cada papel de `tambem`. */
export interface RegraAprovacao { qualquer_um_de: Papel[]; tambem: Papel[] }

/**
 * Regra do Lucas (2/10 à noite, com os ajustes de 3/10):
 * - o principal aprova qualquer tipo de item;
 * - e-mails e mensagens para leads ou para a base: aprovação final do principal ou do growth (basta um); com voz ou
 *   imagem da Marcela, ela também aprova;
 * - roteiros de vídeo: o growth (ou o principal) aprova, e a Marcela também quando ela aparece;
 * - peças com a imagem da Marcela: a Marcela aprova (peça sem ela: principal ou growth, como mensagem);
 * - proposta de teste A/B: principal ou growth; config: só o principal;
 * - operacional comenta, não aprova conteúdo (nunca entra na regra).
 */
export function regraAprovacao(tipo: string, usaMarcela: boolean): RegraAprovacao {
  const tambem: Papel[] = usaMarcela ? ["conteudo"] : [];
  switch (tipo) {
    case "roteiro_video": return { qualquer_um_de: ["principal", "growth"], tambem };
    case "config": return { qualquer_um_de: ["principal"], tambem: [] };
    case "email": case "whatsapp": case "texto": case "peca": case "proposta_ab": default:
      return { qualquer_um_de: ["principal", "growth"], tambem };
  }
}

export function papeisDaRegra(r: RegraAprovacao): Papel[] {
  return [...new Set([...r.qualquer_um_de, ...r.tambem])];
}

export interface Decisao { papel: string; decisao: string; por?: string; em?: string }

/** Estado do item a partir das decisões registradas: pendente (e o que falta), aprovado, editado ou recusado. */
export function estadoAprovacao(r: RegraAprovacao, decisoes: Decisao[]): { status: "pendente" | "aprovado" | "editado" | "recusado"; faltam: Papel[] } {
  if (decisoes.some((d) => d.decisao === "recusado")) return { status: "recusado", faltam: [] };
  const ok = new Set(decisoes.filter((d) => d.decisao === "aprovado" || d.decisao === "editado").map((d) => d.papel));
  const faltam: Papel[] = [];
  if (!r.qualquer_um_de.some((p) => ok.has(p))) faltam.push(...r.qualquer_um_de);
  for (const p of r.tambem) if (!ok.has(p)) faltam.push(p);
  if (faltam.length) return { status: "pendente", faltam };
  return { status: decisoes.some((d) => d.decisao === "editado") ? "editado" : "aprovado", faltam: [] };
}

/** Este papel pode decidir este item agora? Está na regra, tem permissão de decidir e ainda não decidiu. */
export function podeDecidirItem(papel: string | undefined | null, item: { tipo: string; usa_marcela?: boolean | null; status?: string }, decisoes: Decisao[] = []): boolean {
  if (!papel || !permissoesDe(papel).decidir) return false;
  if (item.status && item.status !== "pendente") return false;
  const r = regraAprovacao(item.tipo, !!item.usa_marcela);
  if (!papeisDaRegra(r).includes(papel as Papel)) return false;
  return !decisoes.some((d) => d.papel === papel);
}

/** Texto curto da regra para a tela: "Lucas ou LG; e a Marcela (usa a imagem dela)". Nomes vêm da config. */
export function textoRegra(r: RegraAprovacao, nomes: Record<string, string> = {}): string {
  const n = (p: Papel) => nomes[p] ?? p;
  const base = r.qualquer_um_de.map(n).join(" ou ");
  return r.tambem.length ? `${base}; e ${r.tambem.map(n).join(" e ")} (usa voz ou imagem dela)` : base;
}

// Revisor automático: barra antes da aprovação, para todo papel. Nenhum aprovador passa por cima.
// Checa: preço diferente do da página (config), "de/por", promessa de faturamento ou lucro, e máquina ou produto feito
// por IA (declarado no conteúdo, já que o texto não revela a origem da imagem; ilustração de pessoa ou cenário por IA
// não é barrada, ajuste do Lucas de 3/10).
export interface ConteudoRevisao { texto?: string | null; html?: string | null; assunto?: string | null; previa?: string | null; maquina_ia?: boolean | null; imagens?: { ia?: boolean; tipo?: string }[] | null }
/** Preços da página e outros valores que podem aparecer (R$ 1.000 entra por padrão, ajuste do Lucas de 3/10; outros em config.revisor_valores_permitidos). */
export interface ConfigPrecos { preco_prevenda?: number; preco_atual?: number; valores_permitidos?: number[] }

function formatarMil(n: number): string { return "R$ " + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }

export function revisarConteudo(c: ConteudoRevisao, precos: ConfigPrecos): { ok: boolean; problemas: string[] } {
  const problemas: string[] = [];
  const partes = [c.assunto, c.previa, c.texto, c.html ? c.html.replace(/<[^>]+>/g, " ") : null].filter((x): x is string => typeof x === "string" && x.length > 0);
  const texto = partes.join("\n").replace(/&nbsp;/g, " ");
  // 1) Preço: todo "R$ valor" precisa ser um dos preços da página (pré-venda, atual) ou a diferença em mil entre eles.
  const novo = Number(precos.preco_prevenda), atual = Number(precos.preco_atual);
  const permitidos = new Set<string>();
  if (novo > 0) permitidos.add(formatarMil(novo));
  if (atual > 0) permitidos.add(formatarMil(atual));
  if (novo > 0 && atual > novo) permitidos.add(`R$ ${Math.floor((atual - novo) / 1000)} mil`);
  for (const v of [1000, ...(precos.valores_permitidos ?? [])]) if (Number(v) > 0) permitidos.add(formatarMil(Number(v)));
  const valores = texto.match(/R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?(?:\s?mil)?/g) ?? []; // "R$ 9.900", "R$ 16 mil"; o ponto final da frase fica de fora
  for (const v of valores) {
    const norm = v.replace(/\s+/g, " ").replace("R$ ", "R$ ").replace(/^R\$(\d)/, "R$ $1");
    if (!permitidos.has(norm)) problemas.push(`preço diferente do da página: ${v.trim()}`);
  }
  // 2) "de/por": "de R$ X por R$ Y", "de/por", "de X por Y".
  if (/\bde\s*\/\s*por\b/i.test(texto) || /\bde\s+R\$\s?[\d.]+(?:\s?mil)?\s+(?:por|para)\s+(?:apenas\s+|s[oó]\s+)?R\$/i.test(texto)) problemas.push('construção "de/por"');
  // 3) Promessa de faturamento, lucro, renda ou ganho.
  if (/\b(fature|faturamento|faturando|lucro|lucre|lucrando|renda|rendimento|ganhe|ganhos?|retorno)\b[^.\n]{0,60}(R\$|mil|por m[eê]s|mensal|mensais|por dia|di[aá]rios?|garantid[oa]s?)/i.test(texto) || /R\$\s?[\d.]+(?:\s?mil)?\s*(?:por|ao|\/)\s*(?:m[eê]s|dia|semana)\b/i.test(texto)) problemas.push("promessa de faturamento, lucro ou renda");
  // 4) Máquina ou produto feito por IA: declarado no conteúdo (maquina_ia, ou imagem com ia e tipo maquina/produto).
  if (c.maquina_ia === true || (Array.isArray(c.imagens) && c.imagens.some((i) => i && i.ia === true && /^(m[aá]quina|produto)$/i.test(String(i.tipo ?? "")))) || /\[(m[aá]quina|produto)\s+(por\s+)?IA\]/i.test(texto)) problemas.push("máquina ou produto feito por IA");
  return { ok: problemas.length === 0, problemas: [...new Set(problemas)] };
}

const ACOES_LEITURA = new Set(["quem", "leads", "eventos", "aprovacoes", "encontros", "encontro_leads", "desempenho"]);
const ACOES_ESCRITA: Record<string, keyof Permissoes> = {
  contato_manual: "contato", respondeu: "respondeu", reservar: "reservar", reserva_cancelar: "reservar", corrigir_email: "corrigir_email",
  encontro_salvar: "turmas_editar", presenca: "presenca", comentar: "comentar", propor_ab: "propor_ab", decidir: "decidir",
};

/** Ação da painel-api permitida para o papel? Para "decidir", a regra do item é conferida depois (podeDecidirItem). */
export function podeAcao(papel: string | undefined | null, acao: string): boolean {
  const p = permissoesDe(papel);
  if (ACOES_LEITURA.has(acao)) return p.ver;
  const chave = ACOES_ESCRITA[acao];
  return chave ? p[chave] === true : false;
}

// ---------------------------------------------------------------------------
// Aba "Desempenho" (docs/17): período, taxas e rótulos. O cálculo fica no banco (função desempenho); aqui só o que a tela
// precisa para pedir e mostrar.
// ---------------------------------------------------------------------------

export type Periodo = "hoje" | "7d" | "tudo";

/** Dia de São Paulo (AAAA-MM-DD) de um instante. */
export function diaSP(d: Date, timeZone = "America/Sao_Paulo"): string {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}

/** Intervalo pedido ao banco: hoje; últimos 7 dias (hoje incluído); desde o início (sem limite). */
export function intervaloPeriodo(periodo: string, agora: Date = new Date()): { periodo: Periodo; de: string | null; ate: string | null } {
  const hoje = diaSP(agora);
  if (periodo === "hoje") return { periodo: "hoje", de: hoje, ate: hoje };
  if (periodo === "7d") return { periodo: "7d", de: diaSP(new Date(agora.getTime() - 6 * 86400000)), ate: hoje };
  return { periodo: "tudo", de: null, ate: null };
}

/** Taxa em texto: "12,5%"; sem denominador, "–". Uma casa decimal; 100% e 0% sem vírgula. */
export function taxa(n: number, d: number): string {
  if (!d || d <= 0) return "–";
  const p = (Number(n) * 100) / Number(d);
  const s = p === 0 || p === 100 ? String(Math.round(p)) : (Math.round(p * 10) / 10).toFixed(1).replace(".", ",");
  return s + "%";
}

/** Nome de um disparo da base antiga na tabela: "P2 (A)", "P3-P4 (arte 6)", "P1". */
export function rotuloDisparo(d: { prioridade?: string | null; variante?: string | null; canal?: string | null }): string {
  const p = String(d.prioridade ?? "");
  const base = p === "P3" || p === "P4" ? "P3-P4" : p || "Base antiga";
  const v = String(d.variante ?? "");
  if (!v) return base;
  if (d.canal === "base_p34_cones") return base + " (cones)";
  if (d.canal === "base_p34_arte6") return base + " (arte 6)";
  return base + " (" + v.toUpperCase() + ")";
}
