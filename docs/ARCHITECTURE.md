# Architecture

```
apps/qr-menu      Next.js App Router — guest QR menu (rotating walnut table, cart, live status)
apps/ops          React + Vite — one app, role-specific routes:
                  /pos /kitchen /bar /waiter /admin/* /onboarding /platform /login /register
packages/types    shared TypeScript API types
packages/api-client  typed fetch client, idempotency keys, EUR/BGN formatting
backend/          Laravel 13 — the only source of truth (MySQL/MariaDB)
e2e/              Playwright acceptance test across all apps
```

The operational frontends are consolidated into one Vite app to avoid needless deployment units.
Each role still gets a distinct screen, and permissions are enforced server-side.

## Backend layout
- `app/Domain/Orders/OrderService` is the order state machine: placing, acceptance, station routing, per-item prep, serving, cancel, transfer and clearing a table.
- `app/Domain/Billing/CheckService` and `PaymentService` handle open checks, discounts, split/merge and simulated payments with allocations.
- `app/Domain/Inventory/StockService` is the stock ledger: reserve, consume, release and manual movements, made idempotent with `dedupe_key`.
- `app/Domain/Realtime` broadcasts small hints after commit to `private-branch.{id}` (staff) and `guest.{token}` (guest), and never breaks a request.
- `app/Http/Middleware/ResolveBranch` is the tenant guard: membership check, then a permission check. It returns 404 for foreign branches.
- `app/Support/Permissions` maps roles to granular permissions. `Present` whitelists the JSON shapes. `Idempotency` replays stored responses.

## Realtime model
Events are notifications only. Every client refetches authoritative state from the API on an event and on reconnect,
and also polls as a fallback, so a missed event can never corrupt what is displayed.

## Auth
Staff use Sanctum personal access tokens (Bearer, 16 h). This works across LAN IPs without cookie domain
configuration. For production behind one domain, switch to Sanctum SPA cookie mode with CSRF.
Guests have no account: the random table QR token authorises ordering, and the random session `guest_token`
authorises status and service requests.

## Production notes (not done; no deployment)
HTTPS everywhere, Sanctum SPA cookies, a real queue worker (Redis), Reverb behind TLS, email verification
enforcement, object storage for photos, backups, and certified fiscal/payment integrations before any live sale.
