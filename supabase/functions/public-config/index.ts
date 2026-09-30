// GET /public-config — subconjunto público da configuração + placar do contador + hora do servidor.
import { carregarConfig, cfgNum } from "../_shared/config.ts";
import { db } from "../_shared/db.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { limiteRecebimentoCircular } from "../_shared/datas.ts";
import { percentualDesconto as pct } from "../_shared/validacao.ts";

Deno.serve(async (req) => {
  const cors = await corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json({ erro: "método" }, 405, cors);

  try {
    const { publicos, todos } = await carregarConfig();
    const { data: placar } = await db().from("v_placar").select("reservas_lote1, reservas_total").single();
    const precoAtual = cfgNum(publicos, "preco_atual");
    const precoNovo = cfgNum(publicos, "preco_prevenda");
    const reserva = cfgNum(publicos, "reserva_valor");
    const entrada = cfgNum(publicos, "entrada_valor");
    const prazo = cfgNum(publicos, "circular_prazo_dias", 10);
    const fim = String(publicos["prevenda_fim"] ?? "");
    const derivados = {
      desconto_pct: pct(precoAtual, precoNovo),
      desconto_valor: Math.max(0, precoAtual - precoNovo),
      restante_apos_reserva: Math.max(0, precoNovo - reserva),
      parcelado_valor: Math.max(0, precoNovo - reserva - entrada),
      financiado_valor: Math.max(0, precoNovo - reserva),
      limite_cadastro_para_reservar: fim ? limiteRecebimentoCircular(fim, prazo).toISOString() : null,
      reservas_lote1: placar?.reservas_lote1 ?? 0,
      reservas_total: placar?.reservas_total ?? 0,
      agora: new Date().toISOString(),
    };
    void todos;
    return json({ ...publicos, ...derivados }, 200, { ...cors, "cache-control": "public, max-age=20" });
  } catch (e) {
    console.error("public-config", e);
    return json({ erro: "indisponível" }, 500, cors);
  }
});
