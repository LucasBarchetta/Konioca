// POST /base-antiga-importar — (operador, chave de serviço) promove a base antiga da tabela de preparação para leads
// e agenda os envios conforme a planilha (P1 WhatsApp + e-mail; P2 a P4 começam por e-mail; sem celular válido, só e-mail).
// A carga da planilha para public.base_antiga é feita pelo scripts/base_antiga_preparar.py. Corpo opcional: { limite, forcar }.
// Não roda antes de config.captacao_inicio: promover já enfileira e-mails.
import { db, exigirServico } from "../_shared/db.ts";
import { json, lerJson } from "../_shared/http.ts";
import { carregarConfig, cfgText } from "../_shared/config.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  if (!(await exigirServico(req))) return json({ erro: "não autorizado" }, 401);
  const b = await lerJson<{ limite?: number; forcar?: boolean }>(req);
  const { todos } = await carregarConfig();
  const inicio = cfgText(todos, "captacao_inicio");
  if (!b?.forcar && inicio && Date.now() < new Date(inicio).getTime()) {
    return json({ ok: false, motivo: `captação começa em ${inicio}; nada foi enfileirado (use forcar: true para testar)` }, 409);
  }
  const { data, error } = await db().rpc("base_antiga_promover", { p_limite: b?.limite ?? 2000 });
  if (error) return json({ erro: error.message }, 500);
  return json({ ok: true, ...(Array.isArray(data) ? data[0] : data) });
});
