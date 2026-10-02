import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparPorDia, codigoMeet, quandoEncontro } from "../supabase/functions/_shared/encontros.ts";
import { icsEvento, icsEsc, base64Utf8 } from "../supabase/functions/_shared/ics.ts";

test("Encontros: texto da data, código do Meet e agrupamento por dia", () => {
  assert.equal(quandoEncontro("2026-10-15T13:00:00Z"), "quinta, 15/10, às 10h");
  assert.equal(quandoEncontro("2026-10-16T17:30:00Z"), "sexta, 16/10, às 14h30");
  assert.equal(codigoMeet("https://meet.google.com/abc-defg-hij"), "abc-defg-hij");
  assert.equal(codigoMeet("https://meet.google.com/abc-defg-hij?authuser=0"), "abc-defg-hij");
  assert.equal(codigoMeet(null), "");
  const g = agruparPorDia([{ id: 2, inicio: "2026-10-15T19:00:00Z" }, { id: 1, inicio: "2026-10-15T13:00:00Z" }, { id: 3, inicio: "2026-10-16T13:00:00Z" }]);
  assert.deepEqual(g.map((x) => x.dia), ["Quinta, 15/10", "Sexta, 16/10"]);
  assert.deepEqual(g[0].itens.map((i) => i.id + ":" + i.hora), ["1:10h", "2:16h"]);
});

test("ICS: evento com alarme, escape e dobra de linha; base64 em UTF-8", () => {
  const ics = icsEvento({ uid: "x@konioca", inicio: new Date("2026-10-15T13:00:00Z"), duracaoMin: 30, titulo: "Konioca · encontro, com a Marcela; teste", descricao: "Linha 1\nLinha 2 " + "x".repeat(120), url: "https://meet.google.com/abc-defg-hij", local: "Google Meet" });
  assert.match(ics, /BEGIN:VCALENDAR\r\n/); assert.match(ics, /DTSTART:20261015T130000Z/); assert.match(ics, /DTEND:20261015T133000Z/);
  assert.match(ics, /SUMMARY:Konioca · encontro\\, com a Marcela\\; teste/); assert.match(ics, /TRIGGER:-PT60M/);
  assert.ok(ics.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75), "nenhuma linha acima de 75 bytes");
  assert.equal(icsEsc("a,b;c\nd"), "a\\,b\\;c\\nd");
  assert.equal(Buffer.from(base64Utf8("ção"), "base64").toString("utf8"), "ção");
});
