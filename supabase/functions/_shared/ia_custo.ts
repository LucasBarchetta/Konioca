// Custo da API da Anthropic: cada chamada grava tokens e o custo estimado em ia_chamadas.
// Preços (US$ por milhão de tokens) ficam em config.ia_precos_usd; o acumulado desde config.ia_custo_desde é comparado
// com config.ia_alerta_usd e, ao passar, abre um alerta uma vez (tipo ia_custo). Créditos pré-pagos, sem recarga automática.
import { db } from "./db.ts";
import { type Config, cfgNum, cfgText } from "./cfg.ts";
import { custoUsd, precosDoModelo, type Uso } from "./ia_precos.ts";

export { custoUsd, precosDoModelo, type Precos, type Uso } from "./ia_precos.ts";

/** Grava a chamada e, se o acumulado passar do limite, abre o alerta (uma vez). Nunca lança: custo não pode derrubar a rotina. */
export async function registrarChamadaIA(cfg: Config, rotina: string, modelo: string, uso: Uso): Promise<void> {
  try {
    const sb = db();
    const precos = precosDoModelo(cfg, modelo);
    const custo = precos ? custoUsd(uso, precos) : null;
    await sb.from("ia_chamadas").insert({
      rotina, modelo, input_tokens: uso.input_tokens, output_tokens: uso.output_tokens,
      cache_read_tokens: uso.cache_read_input_tokens ?? 0, cache_write_tokens: uso.cache_creation_input_tokens ?? 0,
      custo_usd: custo, sem_preco: !precos,
    });
    const desde = cfgText(cfg, "ia_custo_desde", "2026-09-30T00:00:00-03:00");
    const limite = cfgNum(cfg, "ia_alerta_usd", 50);
    const { data } = await sb.from("ia_chamadas").select("custo_usd").gte("criado_em", desde);
    const total = (data ?? []).reduce((s, r) => s + Number(r.custo_usd ?? 0), 0);
    if (total > limite) {
      const { data: aberto } = await sb.from("alertas").select("id").eq("tipo", "ia_custo").eq("status", "aberto").maybeSingle();
      if (!aberto) await sb.from("alertas").insert({ tipo: "ia_custo", resumo: `Custo da API da Anthropic desde ${desde.slice(0, 10)}: US$ ${total.toFixed(2)} (limite de aviso US$ ${limite}). Créditos pré-pagos, sem recarga automática.` });
    }
  } catch (e) {
    console.error("ia_custo", e);
  }
}
