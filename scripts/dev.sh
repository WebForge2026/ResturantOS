#!/usr/bin/env bash
# Starts Laravel API (:8000), Reverb websockets (:8080), QR menu (:3000) and Ops app (:5173), all on 0.0.0.0 for LAN testing.
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'kill 0' EXIT
(cd backend && php artisan serve --host=0.0.0.0 --port=8000) &
(cd backend && php artisan reverb:start --host=0.0.0.0 --port=8080) &
pnpm --filter @noar/qr-menu dev &
pnpm --filter @noar/ops dev &
sleep 4
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ipconfig getifaddr en0 2>/dev/null || echo "<LAN-IP>")
echo ""
echo "QR меню:   http://localhost:3000/?table=4    (телефон: http://$IP:3000/?table=4)"
echo "Персонал:  http://localhost:5173              (таблет: http://$IP:5173)"
wait
