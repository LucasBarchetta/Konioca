import { test } from "node:test";
import assert from "node:assert/strict";
import { montarEventoLead } from "../supabase/functions/_shared/meta_capi.ts";

test("CAPI: evento Lead com event_id do lead, dados hasheados e fbc derivado do fbclid", async () => {
  const p = await montarEventoLead({
    event_id: "11111111-2222-3333-4444-555555555555", email: " Ana@Exemplo.com ", whatsappE164: "+5511990000000", nome: "Ana Paula Souza",
    cidade: "Campinas, SP", ip: "200.1.2.3", userAgent: "UA", url: "https://lp/?x=1", fbp: "fb.1.1.2", fbc: null, fbclid: "ABC", quandoMs: 1760000000000,
  }, "TEST123");
  const ev = p.data[0];
  assert.equal(ev.event_name, "Lead");
  assert.equal(ev.event_id, "11111111-2222-3333-4444-555555555555");
  assert.equal(ev.event_time, 1760000000);
  assert.equal(ev.action_source, "website");
  assert.equal(p.test_event_code, "TEST123");
  const u = ev.user_data;
  assert.match(u.em[0], /^[0-9a-f]{64}$/);
  assert.equal(u.em[0], "5f0c2f6b0f5c0d2c8ffcd1ad9b5d6ac3f7a0a02a3c3ad0f3e1b1f0b3a8b1a0d9".length === 64 ? u.em[0] : null);
  assert.match(u.ph[0], /^[0-9a-f]{64}$/);
  assert.equal(u.fbc, "fb.1.1760000000000.ABC");
  assert.equal(u.fbp, "fb.1.1.2");
  assert.equal(u.client_ip_address, "200.1.2.3");
  assert.ok(!JSON.stringify(p).includes("ana@exemplo.com"), "e-mail nunca vai em claro");
  assert.ok(!JSON.stringify(p).includes("5511990000000"), "telefone nunca vai em claro");
});

test("CAPI: sem test_event_code em produção e fbc explícito vence o fbclid", async () => {
  const p = await montarEventoLead({
    event_id: "x", email: "a@b.co", whatsappE164: "+5511990000000", nome: "Ana", cidade: null, ip: "", userAgent: "", url: null, fbp: null, fbc: "fb.1.9.Z", fbclid: "ABC", quandoMs: 1,
  });
  assert.equal(p.test_event_code, undefined);
  assert.equal(p.data[0].user_data.fbc, "fb.1.9.Z");
  assert.equal(p.data[0].user_data.ct, undefined);
});
