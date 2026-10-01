import { test } from "node:test";
import assert from "node:assert/strict";
import { provedorDe, enderecoEnvio, cabecalhosAuth, configuradoCom, segredoUrlOk, urlWebhook } from "../supabase/functions/_shared/whatsapp_regras.ts";

test("provedor: 360dialog só com o valor exato; qualquer outra coisa é Meta", () => {
  assert.equal(provedorDe("360dialog"), "360dialog");
  assert.equal(provedorDe(" 360Dialog "), "360dialog");
  assert.equal(provedorDe(undefined), "meta");
  assert.equal(provedorDe("meta"), "meta");
});

test("endereço e cabeçalho mudam com o provedor; o corpo da mensagem é o mesmo", () => {
  assert.equal(enderecoEnvio("meta", "123"), "https://graph.facebook.com/v21.0/123/messages");
  assert.equal(enderecoEnvio("360dialog", "123"), "https://waba-v2.360dialog.io/messages");
  assert.deepEqual(cabecalhosAuth("meta", "tok"), { authorization: "Bearer tok", "content-type": "application/json" });
  assert.deepEqual(cabecalhosAuth("360dialog", "chave"), { "D360-API-KEY": "chave", "content-type": "application/json" });
});

test("configurado: Meta precisa de token e id do número; 360dialog só da chave", () => {
  assert.equal(configuradoCom("meta", "t", "1"), true);
  assert.equal(configuradoCom("meta", "t", undefined), false);
  assert.equal(configuradoCom("360dialog", "chave", undefined), true);
  assert.equal(configuradoCom("360dialog", undefined, "1"), false);
});

test("webhook da 360dialog: só passa com o segredo certo na URL, com pelo menos 16 caracteres", () => {
  const seg = "segredo-bem-longo-0123456789";
  const url = urlWebhook("https://x.supabase.co/", seg);
  assert.equal(url, "https://x.supabase.co/functions/v1/whatsapp-webhook?s=segredo-bem-longo-0123456789");
  assert.equal(segredoUrlOk(url, seg), true);
  assert.equal(segredoUrlOk(url, "outro-segredo-bem-longo-99"), false);
  assert.equal(segredoUrlOk("https://x.supabase.co/functions/v1/whatsapp-webhook", seg), false);
  assert.equal(segredoUrlOk(url, "curto"), false);
  assert.equal(segredoUrlOk("nao-e-url", seg), false);
});
