// Regras puras da conversa: classificação de resposta, próximo passo, horário comercial, textos curtos.
// Sem dependências. Testado no Node.

export type Classe = "sair" | "sim" | "nao" | "duvida" | "quero" | "agora_nao" | "outro";

const SAIR = /^\s*(sair|parar|pare|cancelar|remover|descadastrar|nao quero mais|não quero mais|stop)\b/i;
const SIM = /^\s*(sim|s|claro|consigo|vou|estarei|com certeza|pode contar|bora|ok|okay|beleza|combinado|to dentro|tô dentro|confirmo|confirmado|vou sim|consigo sim|quero)\b/i;
const NAO = /^\s*(n[aã]o|nao consigo|não consigo|nao vou|não vou|nao posso|não posso|talvez|nao sei|não sei|dificil|difícil)\b/i;

export function classificarResposta(texto: string, botaoId?: string | null): Classe {
  const t = (texto ?? "").trim();
  if (botaoId === "sair") return "sair";
  // Botões da mensagem pós-live e da gravação ("Quero uma" / "Tenho uma dúvida" / "Agora não")
  if (/^quero uma$/i.test(t) || botaoId === "quero") return "quero";
  if (/^tenho uma d[uú]vida$/i.test(t) || botaoId === "duvida") return "duvida";
  if (/^agora n[aã]o$/i.test(t) || botaoId === "agora_nao") return "agora_nao";
  if (botaoId === "sim") return "sim";
  if (botaoId === "nao") return "nao";
  if (SAIR.test(t)) return "sair";
  if (SIM.test(t)) return "sim";
  if (NAO.test(t)) return "nao";
  if (/\?/.test(t) || /^(quanto|como|onde|quando|qual|tem |pode|da pra|dá pra|e se|preciso)/i.test(t)) return "duvida";
  return "outro";
}

export type Estado = "inicio" | "convidado" | "aguardando_intencao" | "conversa" | "humano" | "encerrada";

export interface Passo {
  statusFunil?: string;            // mudança de etapa do funil, quando houver
  novoEstado: Estado;
  resposta: string | null;         // texto curto a enviar (dentro da janela de 24h)
  registrarPergunta: boolean;      // guardar o texto como pergunta/intenção para a live
  presenca: boolean | null;        // confirmou presença?
  humano: boolean;                 // passar para pessoa
}

/**
 * Máquina de estados mínima da etapa 2. O agente de funil (etapa 4) entra depois do "conversa".
 * Estilo: 1 a 2 linhas, uma pergunta por mensagem, sem saudação padrão, sem exclamação em série.
 */
export function proximoPasso(estado: Estado, classe: Classe, texto: string, primeiroNome: string): Passo {
  if (classe === "sair") {
    return { novoEstado: "encerrada", resposta: "Pronto, não mando mais nada da pré-venda. Se mudar de ideia, é só chamar aqui.", registrarPergunta: false, presenca: null, humano: false };
  }
  if (classe === "quero") {
    // Pedido: na etapa 3 abre o formulário; até lá, passa para pessoa com alerta.
    return { novoEstado: "humano", resposta: null, registrarPergunta: false, presenca: null, humano: true, statusFunil: "pediu" };
  }
  if (classe === "agora_nao") {
    // Agora não: silêncio. Volta só nos marcos de contador e prazo (etapa 4).
    return { novoEstado: "conversa", resposta: null, registrarPergunta: false, presenca: null, humano: false, statusFunil: "agora_nao" };
  }
  if (estado === "convidado" || estado === "inicio") {
    if (classe === "sim") return { novoEstado: "aguardando_intencao", resposta: `Boa, ${primeiroNome}. E o que você imagina fazer com a Konioca?`, registrarPergunta: false, presenca: true, humano: false };
    if (classe === "nao") return { novoEstado: "aguardando_intencao", resposta: "Sem problema, a gravação chega no dia seguinte. Me conta uma coisa: o que você imagina fazer com a Konioca?", registrarPergunta: false, presenca: false, humano: false };
    if (classe === "duvida") return { novoEstado: "humano", resposta: null, registrarPergunta: true, presenca: null, humano: true };
    return { novoEstado: "aguardando_intencao", resposta: "Obrigado por responder. O que você imagina fazer com a Konioca?", registrarPergunta: false, presenca: null, humano: false };
  }
  if (estado === "aguardando_intencao") {
    if (texto.trim().length >= 3) {
      return { novoEstado: "conversa", resposta: "Anotado. A Marcela vai preparar a live com casos parecidos com o seu. O lembrete com o link chega uma hora antes.", registrarPergunta: true, presenca: null, humano: false };
    }
    return { novoEstado: "aguardando_intencao", resposta: "Me conta em uma frase: onde você colocaria a máquina?", registrarPergunta: false, presenca: null, humano: false };
  }
  // conversa | humano: qualquer nova mensagem vai para pessoa (o agente de dúvidas chega na etapa 3/4)
  return { novoEstado: "humano", resposta: null, registrarPergunta: classe === "duvida", presenca: null, humano: true };
}

export interface HorarioComercial { dias: number[]; inicio: string; fim: string; fuso: string }

function minutosDe(hhmm: string): number { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); }

/** "09:00" -> "9h"; "09:30" -> "9h30". */
export function horaTexto(hhmm: string): string { const [h, m] = hhmm.split(":"); return `${Number(h)}h${m && m !== "00" ? m : ""}`; }

/** Está no horário comercial? Se não, quando o time retoma (texto honesto para o lead). */
export function situacaoHorario(cfg: HorarioComercial, agora: Date): { aberto: boolean; retomaTexto: string } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: cfg.fuso, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(agora)) p[x.type] = x.value;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  const min = Number(p.hour === "24" ? 0 : p.hour) * 60 + Number(p.minute);
  const diaUtil = cfg.dias.includes(wd);
  const aberto = diaUtil && min >= minutosDe(cfg.inicio) && min < minutosDe(cfg.fim);
  if (aberto) return { aberto: true, retomaTexto: "" };
  // Próximo dia útil (ou hoje mais tarde)
  const hoje = diaUtil && min < minutosDe(cfg.inicio);
  if (hoje) return { aberto: false, retomaTexto: `hoje às ${horaTexto(cfg.inicio)}` };
  const nomes = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  for (let i = 1; i <= 7; i++) {
    const d = (wd + i) % 7;
    if (cfg.dias.includes(d)) {
      const quando = i === 1 ? "amanhã" : `na ${nomes[d]}`;
      return { aberto: false, retomaTexto: `${quando} às ${horaTexto(cfg.inicio)}` };
    }
  }
  return { aberto: false, retomaTexto: "no próximo dia útil" };
}

/** Mensagem honesta de passagem ao humano. */
export function textoPassagemHumano(aberto: boolean, retomaTexto: string, metaMin: number): string {
  if (aberto) return `Recebi. Alguém do Time da Marcela te responde em até ${metaMin} minutos.`;
  return `Recebi. O time retoma ${retomaTexto} e te responde primeiro.`;
}

export function primeiroNome(nome: string): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}
