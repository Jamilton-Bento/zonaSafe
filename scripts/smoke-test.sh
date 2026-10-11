#!/usr/bin/env bash
# Teste de fumaça do ambiente Docker: verifica contêineres, saúde dos serviços e endpoints.
# Uso: ./scripts/smoke-test.sh   (com os serviços já iniciados: docker compose up -d --build)
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
WEB="http://127.0.0.1:${WEB_PORT:-8081}"
fail=0
ok()   { echo "  [OK]   $1"; }
bad()  { echo "  [FALHA] $1"; fail=1; }

echo "1) Contêineres e healthchecks"
for c in central-postgres central-redis central-evolution central-api central-web; do
  state=$(docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}sem-healthcheck{{end}}' "$c" 2>/dev/null || echo "inexistente")
  case "$state" in running/healthy) ok "$c ($state)";; *) bad "$c ($state)";; esac
done

echo "2) PostgreSQL (migrações aplicadas)"
tables=$(docker compose exec -T postgres psql -U central -d central -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d '[:space:]')
[ "${tables:-0}" -ge 15 ] && ok "banco 'central' com $tables tabelas" || bad "banco 'central' sem tabelas (migrações?)"

echo "3) Endpoints"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/healthz")" = 200 ] && ok "front-end /healthz" || bad "front-end /healthz"
curl -s "$WEB/api/health" | grep -q '"db":"ok"' && ok "back-end /api/health (via nginx) com banco OK" || bad "back-end /api/health"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/tasks")" = 401 ] && ok "rotas privadas exigem login (401)" || bad "rota privada sem proteção"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEB/api/webhooks/evolution")" = 404 ] && ok "webhook não exposto pelo navegador" || bad "webhook exposto pelo nginx"

echo "4) Isolamento de portas (não devem estar publicadas no host)"
for p in 5432 6379 3001; do
  (echo > "/dev/tcp/127.0.0.1/$p") 2>/dev/null && bad "porta $p acessível no host" || ok "porta $p não publicada"
done

echo "5) Login e integração com a Evolution API"
jar=$(mktemp)
code=$(curl -s -o /dev/null -w '%{http_code}' -c "$jar" -H 'Content-Type: application/json' -d "{\"email\":\"${ADMIN_EMAIL:-}\",\"password\":\"${ADMIN_PASSWORD:-}\"}" "$WEB/api/auth/login")
if [ "$code" = 200 ]; then
  ok "login do administrador"
  st=$(curl -s -b "$jar" "$WEB/api/whatsapp/status")
  echo "$st" | grep -q '"apiReachable":true' && ok "back-end alcança a Evolution API pela rede interna" || bad "back-end NÃO alcança a Evolution API (veja: docker compose logs evolution-api)"
  echo "     estado da conexão: $(echo "$st" | sed -n 's/.*"connection":"\([a-z]*\)".*/\1/p') (esperado 'close' até ler o QR Code)"
else
  bad "login do administrador (HTTP $code) — confira ADMIN_EMAIL/ADMIN_PASSWORD no .env"
fi
rm -f "$jar"
[ $fail = 0 ] && echo "RESULTADO: tudo certo." || { echo "RESULTADO: há falhas."; exit 1; }
