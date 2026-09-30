import { db } from "./db.ts";

export type Config = Record<string, unknown>;

interface Cache { todos: Config; publicos: Config; em: number }
let cache: Cache | null = null;
const TTL_MS = 20_000;

/** Toda a configuração (privada + pública), com cache curto em memória. */
export async function carregarConfig(forcar = false): Promise<{ todos: Config; publicos: Config }> {
  if (!forcar && cache && Date.now() - cache.em < TTL_MS) return cache;
  const { data, error } = await db().from("config").select("chave, valor, publico");
  if (error) throw new Error("config: " + error.message);
  const todos: Config = {};
  const publicos: Config = {};
  for (const r of data ?? []) {
    todos[r.chave] = r.valor;
    if (r.publico) publicos[r.chave] = r.valor;
  }
  cache = { todos, publicos, em: Date.now() };
  return cache;
}

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
