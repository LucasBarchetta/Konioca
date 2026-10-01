// FAQ oficial v3: o JSON da migration é válido, todo placeholder existe, nenhum número ou data fica digitado na resposta
// (só via placeholder), e nada de emoji, travessão ou "lote extra".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeholders, preencher, valoresFaq, itensPorGatilho } from "../supabase/functions/_shared/faq.ts";

const sql = readFileSync(new URL("../supabase/migrations/20261001000600_faq_oficial_v3.sql", import.meta.url), "utf8");
const bloco = sql.split("-- faq:inicio")[1].split("-- faq:fim")[0];
const json = bloco.slice(bloco.indexOf("'[") + 1, bloco.lastIndexOf("]'") + 1);
const faq = JSON.parse(json);

const cfg = {
  preco_prevenda: 9900, preco_atual: 25900, reserva_valor: 1000, entrada_valor: 5000, financiamento_parceiro: "Bradesco",
  live_data: "2026-10-15T19:00:00-03:00", prevenda_fim: "2026-10-30T23:59:59-03:00", lote1_tamanho: 250, entrega_prazo_dias: 120,
  circular_prazo_dias: 10, garantia_meses: 6, energia_requisito: "220 V, tomada de 20 A, de preferência em circuito próprio",
  frete_regra: "O frete não está incluso: depende da região e é pago direto à transportadora.",
  empresa_razao: "Konioca Franquias e Equipamentos Ltda", empresa_cnpj: "51.071.802/0001-23", fundadora_nome: "Marcela Martins",
};

test("22 itens, ids únicos e campos obrigatórios", () => {
  assert.equal(faq.length, 22);
  assert.equal(new Set(faq.map((i) => i.id)).size, 22);
  for (const i of faq) {
    assert.equal(typeof i.pergunta, "string");
    assert.equal(typeof i.resposta, "string");
    assert.equal(typeof i.humano, "boolean");
    assert.equal(typeof i.humano_apos, "boolean");
    assert.ok(Array.isArray(i.gatilhos) && i.gatilhos.length > 0, `item ${i.id} sem gatilho`);
  }
});

test("todo placeholder tem valor e nenhum número ou data é digitado na resposta", () => {
  const valores = valoresFaq(cfg);
  for (const i of faq) {
    for (const p of placeholders(i.resposta)) assert.ok(p in valores, `item ${i.id}: placeholder ${p} sem valor`);
    const semPlaceholders = i.resposta.replace(/\{\{[a-z0-9_]+\}\}/g, "");
    assert.doesNotMatch(semPlaceholders, /\d/, `item ${i.id} tem número digitado`);
    assert.doesNotMatch(preencher(i.resposta, valores), /\{\{/, `item ${i.id} ficou com placeholder`);
  }
});

test("valores vêm da config e batem com a LP", () => {
  const v = valoresFaq(cfg);
  assert.equal(v.preco_prevenda, "9.900");
  assert.equal(v.pago_ate_assinatura, "6.000");
  assert.equal(v.restante_valor, "3.900");
  assert.equal(v.live_ddmm, "15/10");
  assert.equal(v.prevenda_fim_ddmm, "30/10");
  assert.equal(preencher(faq[1].resposta, v), "R$ 9.900 na pré-venda. A geração atual custa R$ 25.900. O diferencial da pré-venda é ter acesso antes de todo mundo.");
});

test("sem emoji, sem travessão, sem lote extra, sem 'de/por'", () => {
  for (const i of faq) {
    const t = i.pergunta + " " + i.resposta;
    assert.doesNotMatch(t, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `item ${i.id} com emoji`);
    assert.doesNotMatch(t, /[—–]/, `item ${i.id} com travessão`);
    assert.doesNotMatch(t, /lote extra/i, `item ${i.id} cita lote extra`);
    assert.doesNotMatch(t, /\bde R\$ .* por R\$/i, `item ${i.id} usa de/por`);
  }
});

test("humano: quem passa para o time", () => {
  const humano = faq.filter((i) => i.humano).map((i) => i.id);
  assert.deepEqual(humano, [12, 17, 18, 22]);
  const apos = faq.filter((i) => i.humano_apos).map((i) => i.id);
  assert.deepEqual(apos, [2, 3, 4, 6]);
});

test("gatilhos encontram o item certo", () => {
  assert.deepEqual(itensPorGatilho(faq, "Quanto custa a máquina?").map((i) => i.id), [2]);
  assert.deepEqual(itensPorGatilho(faq, "é 220 ou 110?").map((i) => i.id), [11]);
  assert.ok(itensPorGatilho(faq, "quanto vou faturar por mês").some((i) => i.id === 12));
  assert.ok(itensPorGatilho(faq, "vocês são robô?").some((i) => i.id === 22));
  assert.deepEqual(itensPorGatilho(faq, "bom dia"), []);
});
