#!/usr/bin/env bash
# Verificação local e de CI: testes das regras puras, tipos e lint das functions, validacao.js em dia.
set -euo pipefail
cd "$(dirname "$0")/.."
DENO="${DENO:-deno}"
echo "== testes (node)"; node --test tests/*.test.mjs
echo "== testes (python)"; python3 -m unittest discover -s tests -p "test_*.py"
echo "== validacao.js gerado em dia"; node scripts/build-validacao.mjs --check
echo "== deno check"; (cd supabase/functions && "$DENO" check ./*/index.ts ./_shared/*.ts)
echo "== deno lint"; (cd supabase/functions && "$DENO" lint)
echo "== html: tokens não resolvidos no site"; ! grep -nE 'R\$ [0-9]|Bradesco|15/10|30/10' site/index.html site/obrigado.html | grep -v 'data-tpl' | grep -v '<!--' || { echo "valor fixo no HTML"; exit 1; }
echo "ok"
