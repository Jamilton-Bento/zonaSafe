#!/usr/bin/env bash
# Restaura um backup. OPERAÇÃO DESTRUTIVA: substitui o conteúdo do banco de destino.
# Uso: ./scripts/restore.sh backups/central-AAAAMMDD-HHMMSS.sql.gz [banco_destino] [--yes]
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:-}"; TARGET="${2:-${CENTRAL_DB:-central}}"; CONFIRM="${3:-}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
[ -f "$FILE" ] || { echo "Arquivo não encontrado: $FILE" >&2; exit 1; }
gzip -t "$FILE"

if [ "$CONFIRM" != "--yes" ]; then
  echo "ATENÇÃO: isto vai APAGAR e recriar o conteúdo do banco '$TARGET'."
  read -r -p "Digite RESTAURAR para continuar: " ans
  [ "$ans" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
fi

pg() { if [ -n "${PG_LOCAL:-}" ]; then "$@"; else docker compose exec -T postgres "$@"; fi; }
USER_ARGS=(); [ -n "${PG_LOCAL:-}" ] || USER_ARGS=(-U "$PG_SUPERUSER")

# Cria o banco de destino caso não exista (o dump usa --clean --if-exists)
if ! pg psql "${USER_ARGS[@]}" -tAc "SELECT 1 FROM pg_database WHERE datname='$TARGET'" | grep -q 1; then
  pg createdb "${USER_ARGS[@]}" "$TARGET"
fi
zcat "$FILE" | pg psql "${USER_ARGS[@]}" -v ON_ERROR_STOP=1 -q -d "$TARGET" > /dev/null
echo "Restauração concluída em '$TARGET'."
