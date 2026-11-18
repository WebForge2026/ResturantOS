# NOAR RestaurantOS — local demo

Multi-tenant restaurant system with **NOAR BAR & DINNER** as the seeded reference restaurant:
guest QR menu (rotating table), POS, Kitchen display, Bar display, Waiter mobile portal, Admin
(dashboard, floor-plan editor, menu, stock, staff, QR codes, reports and audit), onboarding and platform admin.

> **Local demonstration only.** Payments are **simulated**: no bank, card terminal or fiscal device is
> involved, and nothing here is certified for live sales. Menu items, prices and nutrition values are
> illustrative demo data, not NOAR's verified menu.

## Stack

| Part | Tech | Port |
|---|---|---|
| API (source of truth) | Laravel 13, PHP 8.3, MySQL/MariaDB, Sanctum tokens | 8000 |
| Realtime | Laravel Reverb (WebSocket). Clients fall back to polling | 8080 |
| Guest QR menu | Next.js 15 (`apps/qr-menu`), Motion, Lenis | 3000 |
| Staff apps | React + Vite (`apps/ops`), TanStack Query, Zustand, Recharts | 5173 |

## Requirements

PHP ≥ 8.3 (pdo_mysql, mbstring, intl, gd), Composer, Node 22 + pnpm, and MySQL 8 / MariaDB 10.11.
If you have Docker, `docker compose up -d` starts MySQL and Redis with the right credentials.
Without Docker, create the database by hand:

```sql
CREATE DATABASE noar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE noar_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'noar'@'localhost' IDENTIFIED BY 'noar_local';
GRANT ALL ON noar.* TO 'noar'@'localhost';
GRANT ALL ON noar_test.* TO 'noar'@'localhost';
```

## Start (one sequence)

```bash
./scripts/setup.sh     # composer + pnpm install, .env, key, storage link, migrate + demo seed
./scripts/dev.sh       # API, Reverb, QR menu, Ops app (all bound to 0.0.0.0)
```

The manual equivalents are in `docs/SETUP.md`. Reset the demo data at any time with
`cd backend && php artisan noar:reset`. It refuses to run unless `APP_ENV=local`.

## Open it

- **Guest QR menu:** http://localhost:3000/?table=4. `?table=1…15` works only in the local demo. Real QR codes use `?t=<random token>` (Admin → QR кодове).
- **Staff:** http://localhost:5173. Demo accounts use the password in `backend/.env` → `NOAR_DEMO_PASSWORD` (default `noar-demo-2026`):
  `owner@noar.local`, `manager@noar.local`, `cashier@noar.local`, `waiter@noar.local`,
  `kitchen@noar.local`, `bar@noar.local`, `stock@noar.local`, `admin@platform.local` (platform),
  `owner@bistro.local` (a second, isolated restaurant).

### Phone or tablet on the same Wi-Fi
`dev.sh` prints your LAN IP. Open `http://<LAN-IP>:3000/?table=4` on the phone. The API and
websockets are proxied through ports 3000 and 5173; the phone also needs port 8080 for live QR status
(polling still works without it). If it doesn't load, allow ports 3000, 5173 and 8080 in your firewall.
Never expose these dev servers to the internet.

## Real dish photos
The table plates show real photos as soon as a product has one. Until then a drawn placeholder plate is shown.
- **One dish:** Admin → Меню → product → *Качи снимка* (JPG/PNG/WebP, square top-down shot, ≥ 300 px).
- **Bulk:** `php artisan noar:import-photos --list` prints the expected file names. Put the files in a folder and run
  `php artisan noar:import-photos /path/to/folder`. Files placed in `backend/storage/app/demo-photos/` are
  attached automatically on every `noar:reset`.
- **Table wood:** put a top-down wood photo at `apps/qr-menu/public/table/wood.jpg` and set
  `NEXT_PUBLIC_TABLE_TEXTURE=/table/wood.jpg` in `apps/qr-menu/.env.local`.

Use only photos you are licensed to use.

## Tests

```bash
cd backend && php artisan test                          # Laravel feature tests (MySQL noar_test)
cd backend && php artisan noar:reset && cd ../e2e && pnpm test   # Playwright acceptance flow (stack must be running)
```

## Docs
`docs/ARCHITECTURE.md`, `docs/DOMAIN_RULES.md` (order, check, payment and stock rules), `docs/API.md`,
`docs/QR_DESIGN_SPEC.md`, `docs/SETUP.md`, `docs/PROJECT_STATUS.md`.
