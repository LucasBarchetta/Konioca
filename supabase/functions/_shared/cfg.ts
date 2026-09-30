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
