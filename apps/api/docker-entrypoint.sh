#!/bin/sh
set -e
echo "Aplicando migrações do banco..."
npx prisma migrate deploy
echo "Garantindo administrador inicial (se ADMIN_EMAIL/ADMIN_PASSWORD definidos)..."
node dist/scripts/seedAdmin.js
exec node dist/server.js
