// Gera site/assets/js/validacao.js a partir de supabase/functions/_shared/validacao.ts,
// para o navegador validar o WhatsApp com as mesmas regras do servidor. Uma fonte só.
import { stripTypeScriptTypes } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origem = join(raiz, "supabase/functions/_shared/validacao.ts");
const destino = join(raiz, "site/assets/js/validacao.js");

const ts = readFileSync(origem, "utf8");
let js = stripTypeScriptTypes(ts, { mode: "strip" });
const nomes = [...js.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
js = js.replace(/^export /gm, "");
const saida = `// GERADO por scripts/build-validacao.mjs a partir de supabase/functions/_shared/validacao.ts. Não editar à mão.\n(function () {\n${js}\nwindow.KValid = { ${nomes.join(", ")} };\n})();\n`;
if (process.argv.includes("--check")) {
  const atual = readFileSync(destino, "utf8");
  if (atual !== saida) { console.error("site/assets/js/validacao.js desatualizado. Rode: node scripts/build-validacao.mjs"); process.exit(1); }
  console.log("validacao.js atualizado");
} else {
  writeFileSync(destino, saida);
  console.log("gerado", destino, nomes);
}
