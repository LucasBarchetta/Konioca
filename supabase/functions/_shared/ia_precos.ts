// Cálculo puro do custo da API da Anthropic (sem banco): usado pelo ia_custo.ts e pelos testes no Node.
import type { Config } from "./cfg.ts";

export interface Uso { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }
export interface Precos { in: number; out: number; cache_read?: number; cache_write?: number }

/** Custo em US$ a partir do uso e da tabela de preços por milhão. Puro, testado no Node. */
export function custoUsd(uso: Uso, precos: Precos): number {
  const cacheRead = uso.cache_read_input_tokens ?? 0, cacheWrite = uso.cache_creation_input_tokens ?? 0;
  const v = (uso.input_tokens * precos.in + uso.output_tokens * precos.out + cacheRead * (precos.cache_read ?? precos.in) + cacheWrite * (precos.cache_write ?? precos.in)) / 1_000_000;
  return Math.round(v * 1_000_000) / 1_000_000;
}

export function precosDoModelo(cfg: Config, modelo: string): Precos | null {
  const tabela = cfg["ia_precos_usd"] as Record<string, Precos> | undefined;
  return tabela?.[modelo] ?? null;
}
