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
