// Aprovadores do painel: quem recebe aviso de "conteúdo esperando aprovação" e por qual canal.
// Fonte única: config.painel_aprovadores (lista JSON, privada). Nada de nome, e-mail ou telefone no código.
// Exceção da chave envios_ativos: com a chave em false, o único e-mail que ainda sai é o aviso do painel
// (tag "painel") para um endereço que esteja nesta lista. Lead, base antiga e alerta continuam bloqueados.
// Puro (sem banco): usado pelas functions e pelos testes no Node.
import type { Config } from "./cfg.ts";

export interface Aprovador {
  nome: string;
  email: string;
  whatsapp: string;            // E.164; só entra em uso quando o WhatsApp oficial estiver ativo
  papel: "principal" | "conteudo" | "operacional";
  escopo: string;              // texto para o painel: o que essa pessoa aprova
}

/** Tag de e-mail que a exceção aceita. Qualquer outra tag obedece a envios_ativos sem exceção. */
export const TAG_PAINEL = "painel";

export function aprovadores(cfg: Config): Aprovador[] {
  const v = cfg["painel_aprovadores"];
  if (!Array.isArray(v)) return [];
  return v.filter((a): a is Aprovador => !!a && typeof a === "object" && typeof (a as Aprovador).email === "string" && !/\[[^\]]*\]/.test((a as Aprovador).email));
}

/** E-mails internos liberados na exceção: só os da lista de aprovadores, em minúsculas. */
export function emailsInternos(cfg: Config): string[] {
  return aprovadores(cfg).map((a) => a.email.trim().toLowerCase());
}

/** A exceção vale só para aviso do painel (tag "painel") a um e-mail da lista. Tudo o mais fica bloqueado. */
export function excecaoInterna(cfg: Config, para: string, tag: string): boolean {
  if (tag !== TAG_PAINEL) return false;
  return emailsInternos(cfg).includes(String(para ?? "").trim().toLowerCase());
}
