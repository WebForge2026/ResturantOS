# Local setup (manual steps)

```bash
# backend
cd backend
composer install
cp .env.example .env            # DB_* = noar / noar_local on 127.0.0.1:3306
php artisan key:generate
php artisan storage:link        # serves uploaded dish photos at /storage/…
php artisan noar:reset          # migrate:fresh + demo seed (local only)
php artisan serve --host=0.0.0.0 --port=8000
php artisan reverb:start --host=0.0.0.0 --port=8080     # second terminal

# frontends (repo root)
pnpm install
cp apps/qr-menu/.env.example apps/qr-menu/.env.local
pnpm dev:qr                     # http://localhost:3000/?table=4
pnpm dev:ops                    # http://localhost:5173
```

- **No Redis needed.** Queue is `sync`, cache and sessions use the database.
- **Turning realtime off:** set `BROADCAST_CONNECTION=log` in `backend/.env`. Clients then poll: QR every 5 s with backoff, staff screens every 4–6 s.
- **Proxying:** the Next.js app proxies `/api` and `/storage` to Laravel. Vite proxies `/api`, `/storage` and the Reverb socket `/app`.
- **Fresh MariaDB without Docker (Linux):** `apt install mariadb-server`, then run the SQL from the README.
