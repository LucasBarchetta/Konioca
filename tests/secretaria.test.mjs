import { test } from "node:test";
import assert from "node:assert/strict";
import { meetValido, partesSP, pendenciasSecretaria, segundaDaSemana, textoAgenda, textoDia2h, textoVespera } from "../supabase/functions/_shared/secretaria.ts";

// Turmas fictícias: quinta 15/10 e sexta 16/10 às 18h30 (SP = 21h30 UTC), terça 20/10 sem inscritos.
const T = (id, inicio, inscritos, meet_link = "https://meet.google.com/abc-defg-hij") => ({ id, inicio, duracao_min: 30, capacidade: 35, meet_link, ativo: true, inscritos });
const TURMAS = [T(1, "2026-10-15T21:30:00+00:00", 3), T(3, "2026-10-16T21:30:00+00:00", 1), T(7, "2026-10-20T21:30:00+00:00", 0)];

test("partesSP e segunda da semana: fuso de São Paulo, semana começa na segunda", () => {
  const d = new Date("2026-10-06T12:30:00Z"); // terça 6/10, 9h30 SP
  assert.deepEqual(partesSP(d), { dia: "2026-10-06", hora: 9, minuto: 30, dow: 2 });
  assert.equal(segundaDaSemana(d), "2026-10-05");
  assert.equal(segundaDaSemana(new Date("2026-10-12T02:00:00Z")), "2026-10-05", "domingo 23h SP ainda é a semana de 5/10");
  assert.equal(segundaDaSemana(new Date("2026-10-12T03:00:00Z")), "2026-10-12", "segunda 0h SP vira a semana de 12/10");
});

test("meetValido só aceita link do Google Meet", () => {
  assert.equal(meetValido("https://meet.google.com/abc-defg-hij"), true);
  assert.equal(meetValido("[LINK DO MEET]"), false);
  assert.equal(meetValido(""), false);
  assert.equal(meetValido("https://zoom.us/j/1"), false);
});

test("Agenda inicial sai assim que todas as turmas abertas dos próximos 21 dias têm link; sem link, espera a segunda 9h", () => {
  const agora = new Date("2026-10-06T13:00:00Z"); // terça 10h SP
  const semLink = TURMAS.map((t) => t.id === 7 ? { ...t, meet_link: null } : t);
  assert.deepEqual(pendenciasSecretaria(agora, semLink, new Set()).filter((p) => p.tipo === "agenda"), [], "turma 20/10 sem link segura a agenda inicial");
  const comLink = pendenciasSecretaria(agora, TURMAS, new Set()).filter((p) => p.tipo === "agenda");
  assert.equal(comLink.length, 1);
  assert.equal(comLink[0].chave, "agenda:2026-10-05");
  assert.equal(pendenciasSecretaria(agora, TURMAS, new Set(["agenda:2026-10-05"])).filter((p) => p.tipo === "agenda").length, 0, "não repete na semana");
  const segunda = new Date("2026-10-12T12:05:00Z"); // segunda 12/10, 9h05 SP
  const seg = pendenciasSecretaria(segunda, semLink, new Set(["agenda:2026-10-05"])).filter((p) => p.tipo === "agenda");
  assert.equal(seg[0]?.chave, "agenda:2026-10-12", "segunda às 9h sai mesmo com turma sem link");
  const madrugada = new Date("2026-10-06T04:00:00Z"); // 1h SP
  assert.equal(pendenciasSecretaria(madrugada, TURMAS, new Set()).filter((p) => p.tipo === "agenda").length, 0, "agenda inicial só em horário comercial");
});

test("ICS sai uma vez por link; véspera às 10h com lista, ou alerta de zero inscritos; 2h, 15min e pós só com inscritos", () => {
  const agora = new Date("2026-10-06T13:00:00Z");
  const ics = pendenciasSecretaria(agora, TURMAS, new Set()).filter((p) => p.tipo === "ics");
  assert.deepEqual(ics.map((p) => p.encontro.id), [1, 3, 7]);
  const ja = new Set(ics.map((p) => p.chave));
  assert.equal(pendenciasSecretaria(agora, TURMAS, ja).filter((p) => p.tipo === "ics").length, 0);
  const trocado = TURMAS.map((t) => t.id === 1 ? { ...t, meet_link: "https://meet.google.com/zzz-zzzz-zzz" } : t);
  assert.equal(pendenciasSecretaria(agora, trocado, ja).filter((p) => p.tipo === "ics").length, 1, "link novo gera convite novo");

  const vespera = new Date("2026-10-14T13:10:00Z"); // quarta 14/10, 10h10 SP
  const v = pendenciasSecretaria(vespera, TURMAS, ja).filter((p) => p.tipo === "vespera" || p.tipo === "alerta_zero");
  assert.deepEqual(v.map((p) => [p.tipo, p.encontro.id]), [["vespera", 1]]);
  const vesperaZero = new Date("2026-10-19T13:10:00Z"); // segunda 19/10, 10h10 SP: véspera da turma vazia
  const z = pendenciasSecretaria(vesperaZero, TURMAS, ja).filter((p) => p.tipo === "vespera" || p.tipo === "alerta_zero");
  assert.deepEqual(z.map((p) => [p.tipo, p.encontro.id]), [["alerta_zero", 7]]);
  const cedo = new Date("2026-10-14T12:00:00Z"); // 9h SP
  assert.equal(pendenciasSecretaria(cedo, TURMAS, ja).filter((p) => p.tipo === "vespera").length, 0, "antes das 10h não sai");

  const duasHoras = new Date("2026-10-15T19:35:00Z"); // 16h35 SP, turma às 18h30
  assert.deepEqual(pendenciasSecretaria(duasHoras, TURMAS, ja).filter((p) => p.tipo === "dia_2h").map((p) => p.encontro.id), [1]);
  const quinze = new Date("2026-10-15T21:17:00Z"); // 18h17 SP
  assert.deepEqual(pendenciasSecretaria(quinze, TURMAS, ja).filter((p) => p.tipo === "dia_15min").map((p) => p.encontro.id), [1]);
  const depois = new Date("2026-10-15T22:15:00Z"); // 19h15 SP, turma acabou 19h
  assert.deepEqual(pendenciasSecretaria(depois, TURMAS, ja).filter((p) => p.tipo === "pos").map((p) => p.encontro.id), [1]);
  const vazia = TURMAS.map((t) => ({ ...t, inscritos: 0 }));
  assert.equal(pendenciasSecretaria(duasHoras, vazia, ja).filter((p) => p.tipo === "dia_2h").length, 0, "turma sem inscritos não recebe lembrete do dia");
});

test("Textos: agenda lista turmas e inscritos; véspera traz nome, cidade e negócio; 2h traz o roteiro com a fala da Circular", () => {
  const ag = textoAgenda("Marcela", new Date("2026-10-13T12:00:00Z"), TURMAS); // semana de 12/10
  assert.match(ag.assunto, /Agenda da semana de 12\/10: 2 turmas, 4 inscritos/);
  assert.match(ag.texto, /Quinta, 15\/10, às 18h30 · 3 inscritos de 35/);
  assert.match(ag.texto, /Sexta, 16\/10, às 18h30 · 1 inscrito de 35/);
  assert.doesNotMatch(ag.texto, /20\/10/, "turma da semana seguinte fica fora da agenda desta semana");
  const vp = textoVespera("Marcela", TURMAS[0], [{ nome: "Ana Paula Teste", cidade: "Manaus", tem_negocio: true }, { nome: "Bruno Teste", cidade: null, tem_negocio: false }]);
  assert.match(vp.texto, /- Ana Paula Teste, Manaus · já tem negócio/);
  assert.match(vp.texto, /- Bruno Teste · ainda não tem negócio/);
  assert.match(vp.texto, /meet\.google\.com/);
  const d2 = textoDia2h("Marcela", TURMAS[0], "0 a 3 min · Abertura.\nA fala da Circular: \"Quem já confirmou...\"");
  assert.match(d2.texto, /Roteiro de 30 minutos:\n0 a 3 min/);
  assert.match(d2.texto, /fala da Circular/);
  assert.match(d2.html, /<a href="https:\/\/meet\.google\.com\/abc-defg-hij"/);
});
