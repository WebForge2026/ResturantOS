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
- **Seed:** NOAR with 15 tables (indoor + terrace), 8 staff roles, 20 illustrative dishes in the 5 required categories, recipes, stock, and 6 days of history created through the real services. A second tenant (Бистро Пловдив) is seeded for isolation tests.
- **QR menu:** redesigned to the owner's reference video — light linen/walnut palette, serif typography, a rotating round wooden table with dishes on the rim (single GPU-layer rotation), close-up view, spec card, cart drawer, live status via Reverb with polling fallback.
- **Staff app:**
  - **POS:** live table map, session panel, manual orders, accept/serve, transfer, split/merge, discount, void, checkout with split payments, receipt preview, shifts.
  - **Kitchen/Bar:** per-item status, station filter, timers, opt-in sound.
  - **Waiter:** mobile task feed and tables.
  - **Admin:** dashboard, orders, floor-plan editor (drag/resize/rotate/snap/zoom/undo/keyboard), menu, stock, staff, QR print/download/rotate, reports/shifts/audit, settings.
  - Also: guided 8-step onboarding, platform page.
  - Light theme by default; dark mode via the toggle.

## Tests actually run (latest run)
- `php artisan test`: **10 passed, 143 assertions**. Covers the full table-8 scenario, manual accept, idempotency, modifier validation, cancel/stock release, discount permissions, split/merge, tenant isolation, role permissions, auth and suspension.
- `pnpm test` in `e2e/` (Playwright, real browsers, stack running): **1 passed**. QR on a phone viewport (swipe + buttons) → POS without refresh → Kitchen/Bar each see only their items → partial readiness → waiter serves → round 2 → bill request → cash payment → table cleared → sales +63,70 € exactly once, beef stock −360 g exactly once, audit entry, foreign tenant gets 404.
- Both frontends type-check (`tsc --noEmit`).
- **Not run:** production `next build` / `vite build`, Lighthouse/a11y audit, a real physical phone on LAN (only emulated viewports), and the onboarding wizard as an automated test (it was exercised manually through its components).

## Known limitations / next actions
1. **Real food photos are not included.** Downloading stock photos was blocked in this environment. Plates show drawn placeholders until photos are uploaded (Admin → Меню → Качи снимка) or imported (`php artisan noar:import-photos`). The same applies to an optional wood photo for the table.
2. No `contracts/openapi.yaml` yet — `docs/API.md` describes the API.
3. Email verification is not enforced locally (mail driver `log`).
4. Stock uses a single location per branch (column `location`); there is no inter-location transfer UI.
5. Payments are simulated; there is no fiscal or receipt-printer integration. Not for live sales.
6. Next steps: add a Playwright onboarding test (register → floor drag/save → staff → product → QR), production builds, accessibility pass.

Nothing has been deployed or pushed anywhere.
