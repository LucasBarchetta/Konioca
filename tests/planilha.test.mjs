import { test } from "node:test";
import assert from "node:assert/strict";
import { csvPlanilha, textoSeguro, dataSP, iguais, sha256Hex } from "../supabase/functions/_shared/planilha.ts";

const L = { criado_em: "2026-10-05T13:07:00Z", nome: "Ana Souza", whatsapp: "+5511912345678", email: "ana@exemplo.com", cidade: "Campinas, SP", tem_negocio: true, origem: "marcela_conteudo", utm_source: "instagram", utm_medium: "stories" };

test("planilha: cabeçalho, horário de São Paulo, WhatsApp formatado e origem legível", () => {
  const [cab, linha] = csvPlanilha([L]).trim().split("\n");
  assert.equal(cab, "Data,Nome,WhatsApp,E-mail,Cidade,Tem negócio,Origem,Canal (UTM)");
  assert.equal(linha, '2026-10-05 10:07,Ana Souza,(11) 91234-5678,ana@exemplo.com,"Campinas, SP",Sim,Conteúdo da Marcela,instagram / stories');
  assert.equal(dataSP("2026-10-01T02:30:00Z"), "2026-09-30 23:30");
});

test("planilha: texto do lead nunca vira fórmula e aspas são escapadas", () => {
  assert.equal(textoSeguro('=HYPERLINK("x")'), 'HYPERLINK("x")');
  assert.equal(textoSeguro("+55 teste"), "55 teste");
  assert.equal(textoSeguro("@nome"), "nome");
  const csv = csvPlanilha([{ ...L, nome: '=cmd"x"', tem_negocio: null, origem: null, utm_source: null, utm_medium: null }]);
  assert.match(csv, /,"cmd""x""",/);
});

test("planilha: comparação da chave pelo hash", async () => {
  const h = await sha256Hex("abc");
  assert.equal(h, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(iguais(h, h), true);
  assert.equal(iguais(h, h.replace(/.$/, "0")), false);
});
