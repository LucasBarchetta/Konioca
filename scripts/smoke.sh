#!/usr/bin/env bash
# Teste de ponta a ponta depois de cada publicação (functions ou site). Sem dado pessoal: só códigos e contagens.
# Uso: SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<chave> ./scripts/smoke.sh
# Sem a chave de serviço no ambiente (sessão dos agentes), rodar o equivalente pelo banco:
#   select public.chamar_function('leads-planilha', '{"smoke":true}');
#   -- alguns segundos depois:
#   select status_code, content from net._http_response order by id desc limit 1;   -- esperado: 200 e {"ok":true,"linhas":N}
set -euo pipefail
URL="${SUPABASE_URL:?defina SUPABASE_URL}"; URL="${URL%/}/functions/v1"
falhas=0
checar() { # nome, esperado, obtido
  if [ "$2" = "$3" ]; then echo "ok   $1: $3"; else echo "FALHA $1: esperado $2, veio $3"; falhas=$((falhas+1)); fi
}
# 1. Config pública responde (a LP depende dela).
checar "public-config" 200 "$(curl -sS -o /dev/null -w '%{http_code}' "$URL/public-config")"
# 2. leads-planilha está no ar sem exigir JWT do Supabase: chave errada tem de voltar 401 com o texto da própria function
#    ("não autorizado"). Se a verificação de JWT voltar a ser ligada na publicação, o corpo vira JSON do gateway e isto falha.
corpo=$(curl -sS "$URL/leads-planilha?k=0000000000000000000000000000000000000000")
checar "leads-planilha chave errada" "não autorizado" "$corpo"
# 3. leads-planilha monta o CSV inteiro (mesmo caminho do IMPORTDATA) sem quebrar em nenhum lead.
if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  resp=$(curl -sS -X POST -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "content-type: application/json" -d '{"smoke":true}' "$URL/leads-planilha")
  case "$resp" in '{"ok":true,'*) echo "ok   leads-planilha smoke: $resp";; *) echo "FALHA leads-planilha smoke: $resp"; falhas=$((falhas+1));; esac
else
  echo "aviso: sem SUPABASE_SERVICE_ROLE_KEY, pulei o smoke do CSV (rode pelo banco, ver cabeçalho)"
fi
# 4. Página pública e painel (só o código).
checar "LP" 200 "$(curl -sS -o /dev/null -w '%{http_code}' "${LP_URL:-https://prevenda.konioca.com}/")"
[ "$falhas" -eq 0 ] && echo "smoke ok" || { echo "smoke com $falhas falha(s)"; exit 1; }
