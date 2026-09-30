// Leitura tipada da configuração. Puro (sem banco): usado pelas functions e pelos testes no Node.
export type Config = Record<string, unknown>;

export function cfgText(c: Config, chave: string, padrao = ""): string {
  const v = c[chave];
  if (v === undefined || v === null) return padrao;
  return typeof v === "string" ? v : String(v);
}

export function cfgNum(c: Config, chave: string, padrao = 0): number {
  const v = c[chave];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : padrao;
}

export function cfgBool(c: Config, chave: string, padrao = false): boolean {
  const v = c[chave];
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return padrao;
}

/** Valor ainda entre colchetes = não preenchido por humano. */
export function pendente(v: string): boolean {
  return /\[[^\]]*\]/.test(v);
}

/**
 * Origem aceita pelo CORS. Cada item da lista é uma origem exata ("https://prevenda.konioca.com")
 * ou um curinga de subdomínio ("https://*.konioca.pages.dev"), que aceita qualquer subdomínio
 * daquele domínio no mesmo protocolo, mas não o domínio em si nem domínios parecidos.
 */
export function origemPermitida(origem: string, lista: string[]): boolean {
  if (!origem) return false;
  for (const item of lista) {
    if (item === "*" || item === origem) return true;
    const m = /^(https?):\/\/\*\.([a-z0-9.-]+)$/i.exec(item);
    if (!m) continue;
    let u: URL;
    try {
      u = new URL(origem);
    } catch {
      continue;
    }
    if (u.origin !== origem || u.port !== "") continue;
    if (u.protocol === `${m[1].toLowerCase()}:` && u.hostname.endsWith(`.${m[2].toLowerCase()}`)) return true;
  }
  return false;
}
