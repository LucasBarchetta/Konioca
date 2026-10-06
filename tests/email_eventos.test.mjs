import { test } from "node:test";
import assert from "node:assert/strict";
import { classificarEvento, destinatarioDe, taxaDevolucaoExcedida, temporariaViraBloqueio } from "../supabase/functions/_shared/email_eventos.ts";

test("Devolução definitiva bloqueia só o e-mail; temporária só registra", () => {
  const dura = classificarEvento("email.bounced", { bounce: { type: "Permanent", subType: "General", message: "550 5.1.1 user unknown" } });
  assert.equal(dura.acao, "bloquear_email"); assert.equal(dura.status, "devolvido"); assert.equal(dura.evento, "email_devolvido");
  assert.match(dura.motivo, /definitiva/); assert.match(dura.motivo, /user unknown/);
  const mole = classificarEvento("email.bounced", { bounce: { type: "Transient", subType: "MailboxFull" } });
  assert.equal(mole.acao, "registrar_temporaria"); assert.equal(mole.evento, "email_devolucao_temporaria");
  assert.equal(classificarEvento("email.bounced", {}).acao, "registrar_temporaria", "sem tipo, trata como temporária (não bloqueia à toa)");
});

test("Spam encerra tudo, igual ao opt-out", () => {
  const s = classificarEvento("email.complained", {});
  assert.equal(s.acao, "sair"); assert.equal(s.status, "spam"); assert.equal(s.evento, "email_spam");
});

test("Entrega, abertura e clique só mudam o status; evento desconhecido é ignorado", () => {
  assert.deepEqual(classificarEvento("email.delivered", {}), { status: "entregue", acao: "nenhuma", evento: null, motivo: "entregue" });
  assert.equal(classificarEvento("email.clicked", {}).status, "lido");
  assert.equal(classificarEvento("email.sent", {}).acao, "nenhuma");
  assert.equal(classificarEvento("email.sent", {}).status, null);
});

test("Destinatário do evento em minúsculas; sem 'to', vazio", () => {
  assert.equal(destinatarioDe({ to: ["Ana@Exemplo.com"] }), "ana@exemplo.com");
  assert.equal(destinatarioDe({ to: "x@y.com" }), "x@y.com");
  assert.equal(destinatarioDe({}), "");
});

test("Base antiga: pausa só com amostra mínima e acima do teto", () => {
  assert.equal(taxaDevolucaoExcedida(10, 1, 20, 3), false, "1 em 10 não pausa: abaixo do mínimo");
  assert.equal(taxaDevolucaoExcedida(100, 3, 20, 3), false, "3% exatos não passa do teto");
  assert.equal(taxaDevolucaoExcedida(100, 4, 20, 3), true);
  assert.equal(taxaDevolucaoExcedida(0, 0, 20, 3), false);
});

test("Devolução temporária repetida vira bloqueio no máximo configurado", () => {
  assert.equal(temporariaViraBloqueio(1, 2), false);
  assert.equal(temporariaViraBloqueio(2, 2), true);
  assert.equal(temporariaViraBloqueio(5, 0), false, "máximo 0 desliga a regra");
});

test("Time (6/10): aprovadores e domínio da empresa são 'do time'; o resto não", async () => {
  const { enderecoDoTime, decisaoDevolucaoTime } = await import("../supabase/functions/_shared/email_eventos.ts");
  const internos = ["chefe@exemplo.com.br", "marketing.exemplo@gmail.com"];
  assert.equal(enderecoDoTime("Chefe@Exemplo.com.br", internos, ["konioca.com"]), true, "aprovador, qualquer caixa");
  assert.equal(enderecoDoTime("qualquer.um@konioca.com", internos, ["konioca.com"]), true, "domínio da empresa");
  assert.equal(enderecoDoTime("qualquer.um@konioca.com", internos, ["@Konioca.com "]), true, "domínio com arroba e espaço na config");
  assert.equal(enderecoDoTime("lead@gmail.com", internos, ["konioca.com"]), false);
  assert.equal(enderecoDoTime("", internos, ["konioca.com"]), false);
  assert.equal(enderecoDoTime("x@konioca.com.br", internos, ["konioca.com"]), false, "domínio parecido não conta");

  const agora = new Date("2026-10-06T21:30:00Z"); // 18h30 SP
  assert.equal(decisaoDevolucaoTime(null, agora, 6), "primeira", "sem devolução aberta: registra e avisa, não bloqueia");
  assert.equal(decisaoDevolucaoTime("2026-10-06T16:18:00Z", agora, 6), "mesma_queda", "13h18 → 18h30: 5h12, mesma queda");
  assert.equal(decisaoDevolucaoTime("2026-10-06T12:20:00Z", agora, 6), "bloquear", "9h20 → 18h30: 9h10, voltou outra vez");
  assert.equal(decisaoDevolucaoTime("2026-10-06T15:30:00Z", agora, 6), "bloquear", "exatamente 6h conta como de novo");
  assert.equal(decisaoDevolucaoTime("lixo", agora, 6), "primeira", "data inválida não bloqueia à toa");
});
