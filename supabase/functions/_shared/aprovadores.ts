// Aprovadores do painel: quem recebe aviso de "conteúdo esperando aprovação" e por qual canal.
// Fonte única: config.painel_aprovadores (lista JSON, privada). Nada de nome, e-mail ou telefone no código.
// Exceção da chave envios_ativos: com a chave em false, os únicos e-mails que ainda saem são os avisos internos
// (tags em TAGS_INTERNAS: painel de aprovação, Monitor técnico e prévia de teste) para um endereço que esteja nesta lista.
// Lead, base antiga e alerta de conversa continuam bloqueados.
// Puro (sem banco): usado pelas functions e pelos testes no Node.
import type { Config } from "./cfg.ts";

export interface Aprovador {
  nome: string;
  email: string;
  whatsapp?: string;           // E.164; só entra em uso quando o WhatsApp oficial estiver ativo (opcional: growth não recebe WhatsApp)
  papel: "principal" | "conteudo" | "operacional" | "growth";
  escopo: string;              // texto para o painel: o que essa pessoa aprova
  emails_copia?: string[];     // outros endereços da mesma pessoa: recebem os mesmos avisos e o mesmo link (o token sai só de `email`)
}

/** Tags de e-mail que a exceção aceita. Qualquer outra tag obedece a envios_ativos sem exceção. */
export const TAGS_INTERNAS = ["painel", "monitor", "teste"] as const; // teste: prévia de um e-mail de lead, só para aprovador
export const TAG_PAINEL = "painel";

export function aprovadores(cfg: Config): Aprovador[] {
  const v = cfg["painel_aprovadores"];
  if (!Array.isArray(v)) return [];
  return v.filter((a): a is Aprovador => !!a && typeof a === "object" && typeof (a as Aprovador).email === "string" && !/\[[^\]]*\]/.test((a as Aprovador).email));
}

/** Todos os endereços de um aprovador (principal primeiro, depois as cópias), em minúsculas, sem repetição e sem placeholder. */
export function emailsDe(a: Aprovador): string[] {
  const lista = [a.email, ...(Array.isArray(a.emails_copia) ? a.emails_copia : [])]
    .filter((e): e is string => typeof e === "string" && e.includes("@") && !/\[[^\]]*\]/.test(e))
    .map((e) => e.trim().toLowerCase());
  return [...new Set(lista)];
}

/** Acha o aprovador por qualquer um dos endereços dele (principal ou cópia). */
export function acharAprovador(cfg: Config, email: string): Aprovador | null {
  const e = String(email ?? "").trim().toLowerCase();
  return aprovadores(cfg).find((a) => emailsDe(a).includes(e)) ?? null;
}

/** E-mails internos liberados na exceção: só os da lista de aprovadores (principal e cópias), em minúsculas. */
export function emailsInternos(cfg: Config): string[] {
  return [...new Set(aprovadores(cfg).flatMap(emailsDe))];
}

/** A exceção vale só para aviso interno (tag em TAGS_INTERNAS) a um e-mail da lista. Tudo o mais fica bloqueado. */
export function excecaoInterna(cfg: Config, para: string, tag: string): boolean {
  if (!(TAGS_INTERNAS as readonly string[]).includes(tag)) return false;
  return emailsInternos(cfg).includes(String(para ?? "").trim().toLowerCase());
}
