import { db } from "./db.ts";
import type { Config } from "./cfg.ts";

export { type Config, cfgBool, cfgNum, cfgText, pendente } from "./cfg.ts";

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
