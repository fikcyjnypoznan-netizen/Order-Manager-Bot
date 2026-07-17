#!/bin/sh
set -e

echo ">>> Migracja bazy danych..."
pnpm --filter @workspace/db run push --force
echo ">>> Uruchamianie bota..."
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
