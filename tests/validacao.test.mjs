import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarWhatsapp, validarEmail, validarNome, classificarOrigem, percentualDesconto, formatarWhatsapp, sugerirEmail } from "../supabase/functions/_shared/validacao.ts";

test("WhatsApp: máscara, +55, zero de operadora e sem o 9", () => {
  assert.deepEqual(normalizarWhatsapp("(11) 99000-0000").ok, true);
  assert.equal(normalizarWhatsapp("(11) 99000-0000").e164, "+5511990000000");
  assert.equal(normalizarWhatsapp("+55 11 99000 0000").e164, "+5511990000000");
  assert.equal(normalizarWhatsapp("011990000000").e164, "+5511990000000");
  assert.equal(normalizarWhatsapp("1199000000").e164, "+5511999000000", "celular antigo de 8 dígitos ganha o 9");
  assert.equal(normalizarWhatsapp("5511990000000").e164, "+5511990000000");
});

test("WhatsApp: recusa DDD inexistente, fixo, curto e repetido", () => {
  assert.equal(normalizarWhatsapp("(10) 99000-0000").ok, false);
  assert.equal(normalizarWhatsapp("(20) 99000-0000").ok, false);
  assert.equal(normalizarWhatsapp("(11) 3000-0000").ok, false, "fixo não tem WhatsApp");
  assert.equal(normalizarWhatsapp("(11) 80000-0000").ok, false, "11 dígitos sem o 9");
  assert.equal(normalizarWhatsapp("11 9900").ok, false);
  assert.equal(normalizarWhatsapp("").ok, false);
  assert.equal(normalizarWhatsapp("(11) 99999-9999").ok, false, "todos iguais");
});

test("WhatsApp: formatação de volta", () => {
  assert.equal(formatarWhatsapp("+5511990000000"), "(11) 99000-0000");
  assert.equal(formatarWhatsapp(null), "");
  assert.equal(formatarWhatsapp(undefined), "");
  assert.equal(formatarWhatsapp(""), "");
});

test("E-mail e nome", () => {
  assert.equal(validarEmail(" Lucas@Exemplo.com ").email, "lucas@exemplo.com");
  assert.equal(validarEmail("semarroba").ok, false);
  assert.equal(validarEmail("a@b").ok, false);
  assert.equal(validarNome("  Ana   Paula ").nome, "Ana Paula");
  assert.equal(validarNome("A").ok, false);
  assert.equal(validarNome("123").ok, false);
});

test("Origem: prioridade pago > base > conteúdo > direto", () => {
  assert.equal(classificarOrigem({ utm_source: "instagram", fbclid: "x" }), "trafego_pago");
  // Link oficial dos stories/bio: o Instagram acrescenta fbclid, mas o utm_medium orgânico vence.
  assert.equal(classificarOrigem({ utm_source: "instagram", utm_medium: "stories", fbclid: "x" }), "marcela_conteudo");
  assert.equal(classificarOrigem({ utm_source: "tiktok", utm_medium: "bio", ttclid: "x" }), "marcela_conteudo");
  assert.equal(classificarOrigem({ utm_source: "whatsapp", utm_medium: "mensagem", fbclid: "x" }), "base_propria");
  assert.equal(classificarOrigem({ utm_source: "instagram", utm_medium: "stories", gclid: "x" }), "trafego_pago");
  assert.equal(classificarOrigem({ fbclid: "x" }), "trafego_pago");
  assert.equal(classificarOrigem({ utm_source: "instagram", utm_medium: "cpc" }), "trafego_pago");
  assert.equal(classificarOrigem({ utm_source: "base", utm_medium: "whatsapp" }), "base_propria");
  assert.equal(classificarOrigem({ utm_source: "instagram", utm_medium: "bio" }), "marcela_conteudo");
  assert.equal(classificarOrigem({ referrer: "https://l.instagram.com/?u=..." }), "marcela_conteudo");
  assert.equal(classificarOrigem({}), "direto");
  assert.equal(classificarOrigem({ utm_source: "parceiro-x" }), "outro");
});

test("Desconto sempre arredondado para baixo", () => {
  assert.equal(percentualDesconto(25900, 9900), 61); // 61,77 -> 61
  assert.equal(percentualDesconto(100, 1), 99);
  assert.equal(percentualDesconto(100, 100), 0);
  assert.equal(percentualDesconto(0, 10), 0);
});

test("Sugestão de e-mail: erro de digitação comum vira 'Você quis dizer…?'; domínio certo não gera sugestão", () => {
  assert.equal(sugerirEmail("ericagb12@hotmail.co"), "ericagb12@hotmail.com");
  assert.equal(sugerirEmail("Ana@GMAIL.CON "), "ana@gmail.com");
  assert.equal(sugerirEmail("ana@gmai.com"), "ana@gmail.com");
  assert.equal(sugerirEmail("ana@hotmal.com"), "ana@hotmail.com");
  assert.equal(sugerirEmail("ana@uol.com"), "ana@uol.com.br");
  assert.equal(sugerirEmail("ana@empresa.con.br"), "ana@empresa.com.br");
  assert.equal(sugerirEmail("ana@empresa.cmo"), "ana@empresa.com");
  assert.equal(sugerirEmail("ana@gmail.com"), null);
  assert.equal(sugerirEmail("ana@hotmail.com.br"), null);
  assert.equal(sugerirEmail("ana@empresa.com.br"), null);
  assert.equal(sugerirEmail("ana@dompa.com.br"), null);
  assert.equal(sugerirEmail("semarroba"), null);
  assert.equal(sugerirEmail("ana@"), null);
});
