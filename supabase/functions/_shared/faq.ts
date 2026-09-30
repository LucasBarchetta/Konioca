// FAQ oficial: leitura da config, preenchimento dos placeholders e busca por gatilho.
// Puro (sem banco). O Atendimento (Fase B) só responde com o que sai daqui.
import { type Config, cfgNum, cfgText } from "./cfg.ts";
import { partesData } from "./datas.ts";

export interface FaqItem {
  id: number; pergunta: string; resposta: string; humano: boolean; humano_apos: boolean; gatilhos: string[];
}

function reais(n: number): string { return n.toLocaleString("pt-BR"); }

/** Valores que a FAQ pode citar. Tudo vem da config; nada é digitado na FAQ. */
export function valoresFaq(cfg: Config): Record<string, string> {
  const preco = cfgNum(cfg, "preco_prevenda"), reserva = cfgNum(cfg, "reserva_valor"), entrada = cfgNum(cfg, "entrada_valor");
  const live = partesData(cfgText(cfg, "live_data")), fim = partesData(cfgText(cfg, "prevenda_fim"));
  return {
    preco_prevenda: reais(preco), preco_atual: reais(cfgNum(cfg, "preco_atual")),
    reserva_valor: reais(reserva), entrada_valor: reais(entrada),
    pago_ate_assinatura: reais(reserva + entrada), restante_valor: reais(Math.max(0, preco - reserva - entrada)),
    financiamento_parceiro: cfgText(cfg, "financiamento_parceiro"),
    live_dia_semana: live.diaSemana, live_ddmm: live.ddmm, live_hora: live.hora,
    prevenda_fim_ddmm: fim.ddmm, prevenda_fim_hora: fim.hora,
    lote1_tamanho: String(cfgNum(cfg, "lote1_tamanho")), entrega_prazo_dias: String(cfgNum(cfg, "entrega_prazo_dias")),
    circular_prazo_dias: String(cfgNum(cfg, "circular_prazo_dias", 10)), garantia_meses: String(cfgNum(cfg, "garantia_meses")),
    energia_requisito: cfgText(cfg, "energia_requisito"), frete_regra: cfgText(cfg, "frete_regra"),
    empresa_razao: cfgText(cfg, "empresa_razao"), empresa_cnpj: cfgText(cfg, "empresa_cnpj"), fundadora_nome: cfgText(cfg, "fundadora_nome"),
  };
}

export function placeholders(texto: string): string[] {
  return [...texto.matchAll(/\{\{([a-z0-9_]+)\}\}/g)].map((m) => m[1]);
}

/** Preenche {{chave}}. Placeholder sem valor fica como está, para o Guardião barrar. */
export function preencher(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{\{([a-z0-9_]+)\}\}/g, (todo, k: string) => valores[k] ?? todo);
}

export function faqDaConfig(cfg: Config): FaqItem[] {
  const v = cfg["faq_oficial"];
  return Array.isArray(v) ? (v as FaqItem[]) : [];
}

function norm(s: string): string { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

/** Itens cujo gatilho aparece no texto, na ordem da FAQ. O gatilho começa em início de palavra e pode ser radical ("financ" pega "financiamento"). */
export function itensPorGatilho(faq: FaqItem[], texto: string): FaqItem[] {
  const t = " " + norm(texto).replace(/[^a-z0-9$]+/g, " ") + " ";
  return faq.filter((i) => i.gatilhos.some((g) => t.includes(" " + norm(g).replace(/[^a-z0-9$]+/g, " ").trim())));
}
