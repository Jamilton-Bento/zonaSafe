#!/usr/bin/env bash
# Backup lógico do PostgreSQL (banco do sistema e, opcionalmente, o da Evolution API).
# Uso (Docker, padrão):   ./scripts/backup.sh
# Uso local (testes):     PG_LOCAL=1 PGHOST=localhost PGUSER=... PGPASSWORD=... CENTRAL_DB=central_test ./scripts/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

OUT_DIR="${BACKUP_DIR:-./backups}"
CENTRAL_DB="${CENTRAL_DB:-central}"
EVOLUTION_DB="${EVOLUTION_DB:-evolution}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"

pg() { if [ -n "${PG_LOCAL:-}" ]; then "$@"; else docker compose exec -T postgres "$@"; fi; }
USER_ARGS=(); [ -n "${PG_LOCAL:-}" ] || USER_ARGS=(-U "$PG_SUPERUSER")

dump() {
  local db="$1" file="$OUT_DIR/$2-$STAMP.sql.gz"
  pg pg_dump "${USER_ARGS[@]}" --clean --if-exists --no-owner --no-privileges "$db" | gzip > "$file"
  # Valida o arquivo gerado: precisa ser um gzip íntegro com conteúdo de dump
  gzip -t "$file"
  zcat "$file" | grep -q "PostgreSQL database dump" || { echo "Backup inválido: $file" >&2; rm -f "$file"; exit 1; }
  echo "OK: $file ($(du -h "$file" | cut -f1))"
}

dump "$CENTRAL_DB" central
if [ -z "${SKIP_EVOLUTION:-}" ] && [ -z "${PG_LOCAL:-}" ]; then dump "$EVOLUTION_DB" evolution; fi

# Retenção: mantém os 14 backups mais recentes de cada banco
for prefix in central evolution; do
  { ls -1t "$OUT_DIR"/$prefix-*.sql.gz 2>/dev/null || true; } | tail -n +15 | xargs -r rm -f --
done
