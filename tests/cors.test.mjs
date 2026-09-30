import { test } from "node:test";
import assert from "node:assert/strict";
import { origemPermitida } from "../supabase/functions/_shared/cfg.ts";

const LISTA = ["https://prevenda.konioca.com", "https://konioca.pages.dev", "https://*.konioca.pages.dev"];

test("CORS: origens exatas e subdomínios de prévia do Pages", () => {
  assert.equal(origemPermitida("https://prevenda.konioca.com", LISTA), true);
  assert.equal(origemPermitida("https://konioca.pages.dev", LISTA), true);
  assert.equal(origemPermitida("https://a1b2c3d4.konioca.pages.dev", LISTA), true);
  assert.equal(origemPermitida("https://claude-nice-euler.konioca.pages.dev", LISTA), true);
});

test("CORS: recusa domínios parecidos, outro protocolo e porta", () => {
  assert.equal(origemPermitida("https://evilkonioca.pages.dev", LISTA), false);
  assert.equal(origemPermitida("https://x.konioca.pages.dev.evil.com", LISTA), false);
  assert.equal(origemPermitida("http://x.konioca.pages.dev", LISTA), false);
  assert.equal(origemPermitida("https://x.konioca.pages.dev:8443", LISTA), false);
  assert.equal(origemPermitida("https://outro.pages.dev", LISTA), false);
  assert.equal(origemPermitida("", LISTA), false);
  assert.equal(origemPermitida("null", LISTA), false);
});

test("CORS: curinga não aceita o próprio domínio sem estar listado", () => {
  assert.equal(origemPermitida("https://konioca.pages.dev", ["https://*.konioca.pages.dev"]), false);
});
