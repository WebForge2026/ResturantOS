# Project status — 18.11.2026

## Implemented and working locally
- **Backend (Laravel 13 + MariaDB 10.11):**
  - multi-tenant organizations/branches/memberships with granular role permissions;
  - Sanctum token auth, owner sign-up, PIN switch;
  - floor plan, QR tokens and rotation;
  - menu with variants/modifiers, CSV import and photo upload;
  - station routing; order state machine; per-station prep tickets;
  - open checks filled at acceptance; discounts, void, split/merge;
  - simulated cash/card payments with allocations; shifts with cash reconciliation;
  - service requests (bill/waiter); idempotency keys; rate limiting; audit log;
  - stock ledger (reserve → consume on ready → release on cancel, dedupe-safe), suppliers, receipts, recipes, reorder rule;
  - reports and CSV export; platform admin (suspend, feature flags); Reverb broadcasting after commit.
- **Seed:** NOAR's real menu imported from Wolt (14 categories, 98 dishes with prices and photos; `scripts/import-wolt-menu.py`). Also seeded: 15 tables (indoor + terrace), 8 staff roles, recipes for key dishes, stock, and 6 days of history created through the real services. A second tenant (Бистро Пловдив) is seeded for isolation tests.
- **QR menu:** standard clean menu (owner request: rotating table removed) — light linen palette, sticky search and categories, photo cards with a morphing +/stepper button, dish detail sheet, cart drawer, live status via Reverb with polling fallback.
- **Staff app:**
  - **POS:** live table map, session panel, manual orders, accept/serve, transfer, split/merge, discount, void, checkout with split payments, receipt preview, shifts.
  - **Kitchen/Bar:** per-item status, station filter, timers, opt-in sound.
  - **Waiter:** mobile task feed and tables.
  - **Admin:** dashboard, orders, floor-plan editor (drag/resize/rotate/snap/zoom/undo/keyboard), menu, stock, staff, QR print/download/rotate, reports/shifts/audit, settings.
  - Also: guided 8-step onboarding, platform page.
  - Light theme by default; dark mode via the toggle.

## Tests actually run (latest run)
- `php artisan test`: **10 passed, 143 assertions**. Covers the full table-8 scenario, manual accept, idempotency, modifier validation, cancel/stock release, discount permissions, split/merge, tenant isolation, role permissions, auth and suspension.
- `pnpm test` in `e2e/` (Playwright, real browsers, stack running): **1 passed**. QR on a phone viewport (card +/stepper, search, category bar, detail sheet) → POS without refresh → Kitchen/Bar each see only their items → partial readiness → waiter serves → round 2 → bill request → cash payment → table cleared → sales +40,00 € exactly once, beef stock −360 g exactly once, audit entry, foreign tenant gets 404.
- Both frontends type-check (`tsc --noEmit`).
- **Not run:** production `next build` / `vite build`, Lighthouse/a11y audit, a real physical phone on LAN (only emulated viewports), and the onboarding wizard as an automated test (it was exercised manually through its components).

## Vercel test deployment (prepared, not deployed by me)
- `backend/api/index.php` + `backend/vercel.json` (vercel-php runtime, writable paths in /tmp), Postgres support verified locally (PostgreSQL 16: all 10 Laravel tests pass), protected `POST /api/v1/system/setup`, configurable CORS, photos served by the frontends from `/menu/`.
- Verified locally in a Vercel-like setup (Postgres, production builds of both frontends, no websockets, cross-origin API): the full Playwright acceptance flow passes.
- Not verified: the real Vercel/Neon environment itself (needs the owner's accounts). See `docs/DEPLOY_VERCEL.md`.

## Known limitations / next actions
1. Wolt provides no allergens or nutrition values; they must be entered in Admin (none are invented).
2. No `contracts/openapi.yaml` yet — `docs/API.md` describes the API.
3. Email verification is not enforced locally (mail driver `log`).
4. Stock uses a single location per branch (column `location`); there is no inter-location transfer UI.
5. Payments are simulated; there is no fiscal or receipt-printer integration. Not for live sales.
6. Next steps: add a Playwright onboarding test (register → floor drag/save → staff → product → QR), production builds, accessibility pass.

Nothing has been deployed or pushed anywhere.
