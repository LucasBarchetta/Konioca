import { test } from "node:test";
import assert from "node:assert/strict";
import { limiteRecebimentoCircular, liberacaoPagamento, aindaDaTempo, partesData, formatarReais, formatarReaisCentavos, contagemRegressiva, numeroNoLote } from "../supabase/functions/_shared/datas.ts";

const FIM = "2026-10-30T23:59:59-03:00";

test("Circular: quem recebe até 20/10 23h59 ainda reserva na pré-venda", () => {
  const lim = limiteRecebimentoCircular(FIM, 10);
  assert.equal(partesData(lim.toISOString()).ddmm, "20/10");
  assert.equal(aindaDaTempo(new Date("2026-10-20T20:00:00-03:00"), FIM, 10), true);
  assert.equal(aindaDaTempo(new Date("2026-10-21T08:00:00-03:00"), FIM, 10), false);
});

test("Liberação de pagamento = recebimento + 10 dias", () => {
  const lib = liberacaoPagamento("2026-10-06T10:00:00-03:00", 10);
  assert.equal(lib.toISOString(), new Date("2026-10-16T10:00:00-03:00").toISOString());
});

test("Partes da data nos formatos aprovados", () => {
  const live = partesData("2026-10-15T19:00:00-03:00");
  assert.equal(live.diaSemanaCap, "Quinta");
  assert.equal(live.ddmm, "15/10");
  assert.equal(live.hora, "19h");
  const fim = partesData(FIM);
  assert.equal(fim.hora, "23h59");
  assert.equal(fim.ddmm, "30/10");
});

test("Formatação de reais", () => {
  assert.equal(formatarReais(9900), "R$ 9.900");
  assert.equal(formatarReais(25900), "R$ 25.900");
  assert.equal(formatarReais(1000), "R$ 1.000");
  assert.equal(formatarReaisCentavos(3900 / 12), "R$ 325");
  assert.equal(formatarReaisCentavos(1234.5), "R$ 1.234,50");
});

test("Contagem regressiva", () => {
  assert.equal(contagemRegressiva(new Date("2026-10-18T19:59:59-03:00"), FIM).texto, "12 dias e 4 horas");
  assert.equal(contagemRegressiva(new Date("2026-10-30T20:39:59-03:00"), FIM).texto, "3 horas e 20 min");
  assert.equal(contagemRegressiva(new Date("2026-10-31T00:00:00-03:00"), FIM).encerrada, true);
});

test("Numeração no lote", () => {
  assert.equal(numeroNoLote(37, 250), "037 de 250");
  assert.equal(numeroNoLote(12, null), "012");
});
