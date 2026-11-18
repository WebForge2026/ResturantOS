#!/usr/bin/env bash
# One-time local setup: PHP deps, .env, key, storage link, migrations + demo seed, JS deps.
set -euo pipefail
cd "$(dirname "$0")/.."
(cd backend && composer install)
[ -f backend/.env ] || cp backend/.env.example backend/.env
(cd backend && grep -q '^APP_KEY=base64' .env || php artisan key:generate)
(cd backend && php artisan storage:link || true)
(cd backend && php artisan noar:reset)
[ -f apps/qr-menu/.env.local ] || cp apps/qr-menu/.env.example apps/qr-menu/.env.local
pnpm install
echo "Готово. Стартирайте: ./scripts/dev.sh"
