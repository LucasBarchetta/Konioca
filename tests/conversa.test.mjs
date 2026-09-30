import { test } from "node:test";
import assert from "node:assert/strict";
import { classificarResposta, proximoPasso, situacaoHorario, textoPassagemHumano } from "../supabase/functions/_shared/conversa.ts";

const HC = { dias: [1, 2, 3, 4, 5], inicio: "09:00", fim: "18:00", fuso: "America/Sao_Paulo" };

test("Classificação: Sair vence tudo, botões mandam, texto livre é lido", () => {
  assert.equal(classificarResposta("Sair"), "sair");
  assert.equal(classificarResposta("sair por favor"), "sair");
  assert.equal(classificarResposta("qualquer", "sair"), "sair");
  assert.equal(classificarResposta("Sim, consigo!"), "sim");
  assert.equal(classificarResposta("vou sim"), "sim");
  assert.equal(classificarResposta("não consigo nesse horário"), "nao");
  assert.equal(classificarResposta("Quanto custa o insumo?"), "duvida");
  assert.equal(classificarResposta("dá pra parcelar"), "duvida");
  assert.equal(classificarResposta("tenho uma academia em Campinas"), "outro");
});

test("Convite respondido com sim: confirma presença e pergunta o que imagina fazer", () => {
  const p = proximoPasso("convidado", "sim", "sim", "Ana");
  assert.equal(p.novoEstado, "aguardando_intencao");
  assert.equal(p.presenca, true);
  assert.match(p.resposta ?? "", /o que você imagina fazer com a Konioca\?$/);
  assert.ok(!/!/.test(p.resposta ?? ""), "sem exclamação");
});

test("Convite respondido com não: sem pressão, mesma pergunta, avisa da gravação", () => {
  const p = proximoPasso("convidado", "nao", "não consigo", "Ana");
  assert.equal(p.presenca, false);
  assert.match(p.resposta ?? "", /gravação/);
  assert.equal((p.resposta?.match(/\?/g) ?? []).length, 1, "uma pergunta por mensagem");
});

test("Resposta à intenção vira pergunta para a live", () => {
  const p = proximoPasso("aguardando_intencao", "outro", "Quero colocar na minha academia", "Ana");
  assert.equal(p.registrarPergunta, true);
  assert.equal(p.novoEstado, "conversa");
});

test("Dúvida no convite e qualquer mensagem depois vão para pessoa", () => {
  assert.equal(proximoPasso("convidado", "duvida", "quanto custa?", "Ana").humano, true);
  assert.equal(proximoPasso("conversa", "outro", "oi", "Ana").humano, true);
});

test("Sair encerra e responde uma vez", () => {
  const p = proximoPasso("conversa", "sair", "sair", "Ana");
  assert.equal(p.novoEstado, "encerrada");
  assert.ok(p.resposta);
});

test("Horário comercial: honesto sobre quando o time retoma", () => {
  assert.equal(situacaoHorario(HC, new Date("2026-10-15T10:00:00-03:00")).aberto, true);            // quinta 10h
  assert.equal(situacaoHorario(HC, new Date("2026-10-15T20:00:00-03:00")).retomaTexto, "amanhã às 9h"); // quinta 20h
  assert.equal(situacaoHorario(HC, new Date("2026-10-16T19:00:00-03:00")).retomaTexto, "na segunda às 9h"); // sexta 19h
  assert.equal(situacaoHorario(HC, new Date("2026-10-15T07:00:00-03:00")).retomaTexto, "hoje às 9h");  // quinta 7h
  assert.match(textoPassagemHumano(true, "", 15), /15 minutos/);
  assert.match(textoPassagemHumano(false, "amanhã às 9h", 15), /retoma amanhã às 9h/);
});

test("Botões da gravação: Quero uma vai para pessoa; Agora não é silêncio", () => {
  assert.equal(classificarResposta("Quero uma"), "quero");
  assert.equal(classificarResposta("Tenho uma dúvida"), "duvida");
  assert.equal(classificarResposta("Agora não"), "agora_nao");
  const q = proximoPasso("conversa", "quero", "Quero uma", "Ana");
  assert.equal(q.humano, true); assert.equal(q.statusFunil, "pediu");
  const a = proximoPasso("conversa", "agora_nao", "Agora não", "Ana");
  assert.equal(a.resposta, null); assert.equal(a.humano, false); assert.equal(a.statusFunil, "agora_nao");
});
