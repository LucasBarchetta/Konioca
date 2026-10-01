import { test } from "node:test";
import assert from "node:assert/strict";
import { quantidadeValida, textoCobranca, assinaturaAprovador, filtrarLeads, ddmm, botaoReservar } from "../supabase/functions/_shared/painel_regras.ts";

test("Quantidade do 'Reservou': inteiro de 1 a 10", () => {
  assert.equal(quantidadeValida(1), 1); assert.equal(quantidadeValida("3"), 3); assert.equal(quantidadeValida(10), 10);
  assert.equal(quantidadeValida(0), null); assert.equal(quantidadeValida(11), null); assert.equal(quantidadeValida(2.5), null); assert.equal(quantidadeValida(""), null);
});

test("Texto de cobrança segue a view: sem Circular, faltam dias, pode cobrar", () => {
  assert.deepEqual(textoCobranca({ circular_confirmada_em: null }), { texto: "Circular não confirmada", tom: "vermelho" });
  assert.deepEqual(textoCobranca({ circular_confirmada_em: "2026-10-01T12:00:00Z", liberado_em: "2026-10-11T12:00:00Z", pode_cobrar: false, dias_faltam: 7 }), { texto: "Faltam 7 dias", tom: "cinza" });
  assert.deepEqual(textoCobranca({ circular_confirmada_em: "2026-10-01T12:00:00Z", liberado_em: "2026-10-11T12:00:00Z", pode_cobrar: false, dias_faltam: 1 }), { texto: "Falta 1 dia", tom: "cinza" });
  assert.deepEqual(textoCobranca({ circular_confirmada_em: "2026-09-20T12:00:00Z", liberado_em: "2026-09-30T12:00:00Z", pode_cobrar: true, dias_faltam: 0 }), { texto: "Pode cobrar desde 30/09", tom: "verde" });
});

test("ddmm no fuso de São Paulo", () => { assert.equal(ddmm("2026-10-01T02:30:00Z"), "30/09"); assert.equal(ddmm(null), ""); });

test("Assinatura do aprovador nos eventos", () => {
  assert.equal(assinaturaAprovador({ nome: "Lucas", papel: "principal" }), "Lucas (principal)");
  assert.equal(assinaturaAprovador({ email: "ana@x.com" }), "ana");
});

test("Filtros da lista", () => {
  const L = [
    { id: 1, pode_cobrar: true, circular_confirmada_em: "x", reservou_em: null, contato_manual_em: null, optout_em: null, base_antiga: false },
    { id: 2, pode_cobrar: false, circular_confirmada_em: null, reservou_em: null, contato_manual_em: "x", optout_em: null, base_antiga: false },
    { id: 3, pode_cobrar: true, circular_confirmada_em: "x", reservou_em: "x", contato_manual_em: null, optout_em: null, base_antiga: false },
    { id: 4, pode_cobrar: false, circular_confirmada_em: null, reservou_em: null, contato_manual_em: null, optout_em: "x", base_antiga: false },
    { id: 5, pode_cobrar: false, circular_confirmada_em: null, reservou_em: null, contato_manual_em: null, optout_em: null, base_antiga: true },
  ];
  assert.deepEqual(filtrarLeads(L, "todos").map((l) => l.id), [1, 2, 3, 4]);
  assert.deepEqual(filtrarLeads(L, "pode_cobrar").map((l) => l.id), [1]);
  assert.deepEqual(filtrarLeads(L, "sem_circular").map((l) => l.id), [2, 5]);
  assert.deepEqual(filtrarLeads(L, "reservados").map((l) => l.id), [3]);
  assert.deepEqual(filtrarLeads(L, "contatados").map((l) => l.id), [2]);
  assert.deepEqual(filtrarLeads(L, "sairam").map((l) => l.id), [4]);
  assert.deepEqual(filtrarLeads(L, "base_antiga").map((l) => l.id), [5]);
});

test("'Reservou' só com pode cobrar; fora disso, desativado com o motivo", () => {
  assert.deepEqual(botaoReservar({ circular_confirmada_em: null }), { ativo: false, texto: "Circular não confirmada" });
  assert.deepEqual(botaoReservar({ circular_confirmada_em: "x", pode_cobrar: false, dias_faltam: 4 }), { ativo: false, texto: "Faltam 4 dias" });
  assert.deepEqual(botaoReservar({ circular_confirmada_em: "x", pode_cobrar: true, liberado_em: "2026-09-30T12:00:00Z" }), { ativo: true, texto: "Reservou" });
  assert.equal(botaoReservar({ circular_confirmada_em: "x", pode_cobrar: true, reservou_em: "x" }).ativo, false);
  assert.equal(botaoReservar({ circular_confirmada_em: "x", pode_cobrar: true, optout_em: "x" }).ativo, false);
});
