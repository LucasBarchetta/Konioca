// Planilha em tempo real, Turnstile e custo da API: regras puras.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linhaTempoReal, sucessoHttp } from "../supabase/functions/_shared/planilha_tempo_real.ts";
import { CABECALHO, linhaPlanilha } from "../supabase/functions/_shared/planilha.ts";
import { classificarSiteverify } from "../supabase/functions/_shared/turnstile.ts";
import { custoUsd } from "../supabase/functions/_shared/ia_precos.ts";

const lead = {
  criado_em: "2026-09-30T21:40:29.000Z", nome: "Ana Souza", whatsapp: "+5511999990000", email: "ana@exemplo.com", cidade: "Campinas, SP",
  tem_negocio: true, origem: "marcela_conteudo", utm_source: "instagram", utm_medium: "stories", bloqueado_em: null,
};

test("linha em tempo real: mesmas colunas, mesma ordem e mesmos valores da leads-planilha, nada a mais", () => {
  const obj = linhaTempoReal(lead);
  assert.deepEqual(Object.keys(obj), CABECALHO);
  assert.deepEqual(Object.values(obj), linhaPlanilha(lead));
  assert.equal(obj["Data"], "30/09/2026 18h40");
  assert.equal(obj["WhatsApp"], "(11) 99999-0000");
  assert.equal(obj["Origem"], "Conteúdo da Marcela");
  assert.equal(obj["Canal (UTM)"], "instagram / stories");
  assert.equal(obj["Contato"], "");
  assert.ok(!("id" in obj) && !("token" in obj) && !("ip" in obj));
});

test("302 do Google conta como gravado; 4xx e 5xx não", () => {
  assert.equal(sucessoHttp(200), true);
  assert.equal(sucessoHttp(302), true);
  assert.equal(sucessoHttp(401), false);
  assert.equal(sucessoHttp(500), false);
});

test("Turnstile: token inválido recusa; Cloudflare fora ou segredo errado aceita sem verificação", () => {
  assert.equal(classificarSiteverify(true, { success: true }).status, "ok");
  assert.equal(classificarSiteverify(true, { success: false, "error-codes": ["invalid-input-response"] }).status, "recusado");
  assert.equal(classificarSiteverify(true, { success: false, "error-codes": ["timeout-or-duplicate"] }).status, "recusado");
  assert.equal(classificarSiteverify(true, { success: false, "error-codes": ["invalid-input-secret"] }).status, "indisponivel");
  assert.equal(classificarSiteverify(true, { success: false, "error-codes": ["internal-error"] }).status, "indisponivel");
  assert.equal(classificarSiteverify(false, null).status, "indisponivel");
});

test("custo da API: tokens x preço por milhão", () => {
  const precos = { in: 4, out: 20, cache_read: 0.2 };
  assert.equal(custoUsd({ input_tokens: 1_000_000, output_tokens: 0 }, precos), 4);
  assert.equal(custoUsd({ input_tokens: 2000, output_tokens: 500, cache_read_input_tokens: 10_000 }, precos), 0.02);
});

test("exceção de envios_ativos: só aviso do painel para e-mail da lista de aprovadores", async () => {
  const { excecaoInterna, emailsInternos } = await import("../supabase/functions/_shared/aprovadores.ts");
  const cfg = { painel_aprovadores: [
    { nome: "A", email: "Principal@Exemplo.com", whatsapp: "+5511999990000", papel: "principal", escopo: "tudo" },
    { nome: "B", email: "[EMAIL CONTEUDO]", whatsapp: "[E164]", papel: "conteudo", escopo: "" },
  ] };
  assert.deepEqual(emailsInternos(cfg), ["principal@exemplo.com"]);          // placeholder entre colchetes não conta
  assert.equal(excecaoInterna(cfg, "principal@exemplo.com", "painel"), true);
  assert.equal(excecaoInterna(cfg, "principal@exemplo.com", "convite"), false); // outra tag: bloqueado
  assert.equal(excecaoInterna(cfg, "lead@gmail.com", "painel"), false);         // fora da lista: bloqueado
  assert.equal(excecaoInterna({}, "principal@exemplo.com", "painel"), false);   // sem lista: bloqueado
});
