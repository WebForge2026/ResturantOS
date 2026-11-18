# API v1 (`/api/v1`)

Errors are always returned as `{"error":{"code","message","details?"}}` with the HTTP status code.
Mutations that create money or orders require an `Idempotency-Key` header. A retry with the same key replays the stored response (`Idempotent-Replay: true`).
Staff routes need `Authorization: Bearer <token>`.

## Public (guest)
| Method | Path | Notes |
|---|---|---|
| GET | `/public/demo/tables` | **local demo only** — maps table numbers to QR tokens |
| GET | `/public/tables/{qrToken}` | restaurant, table and menu |
| POST | `/public/tables/{qrToken}/orders` | `{items:[{product_id,quantity,modifier_ids[],note?}], note?}` → `{order, guest_token}` (rate-limited, idempotent) |
| GET | `/public/sessions/{guestToken}` | live orders, item statuses and check due |
| POST | `/public/sessions/{guestToken}/requests` | `{type: bill\|waiter}` |

## Auth
`POST /auth/login`, `POST /auth/register` (owner sign-up → org + branch), `GET /auth/me`, `POST /auth/logout`, `POST /auth/pin-switch`.

## Branch (`/branches/{branch}`; required permission in brackets)
- **Branch and setup:** `GET /` [branch.view] · `PATCH /` [branch.manage] · `PATCH /settings` [settings.manage] · `PATCH /onboarding`
- **Floor and QR:** `GET|PUT /floor` [floor.manage] · `GET /qr-codes`, `POST /tables/{id}/rotate-qr` [qr.manage] · `POST|PUT /stations`
- **Menu:**
  - `GET /menu`
  - `POST|PUT /categories`, `DELETE /categories/{id}`
  - `POST|PUT /products`, `DELETE /products/{id}`
  - `POST /products/{id}/image` (multipart `image`)
  - `PATCH /products/{id}/availability`
  - `POST /menu/import` (`{csv, preview}`)
- **Staff:** `GET|POST /staff`, `PATCH /staff/{membership}` [staff.manage]
- **Service:**
  - `GET /tables-live`
  - `POST /sessions`, `GET /sessions/{id}`
  - `POST /sessions/{id}/orders|transfer|clear|waiter|request-bill`
  - `GET /orders`
  - `POST /orders/{id}/accept|cancel|serve`
  - `POST /order-items/{id}/cancel`
  - `GET /waiter/feed`
  - `PATCH /requests/{id}`
- **KDS / Bar:** `GET /kds?display=kitchen|bar&station_id=` · `PATCH /prep-items/{id}` · `PATCH /prep-tickets/{id}`
- **Checks:**
  - `GET /checks/{id}`, `GET /checks/{id}/receipt`
  - `POST /checks/{id}/discount|split|merge|payments`
  - `POST /check-items/{id}/void`
  - `GET /shifts`, `GET /shifts/current`, `POST /shifts`, `POST /shifts/{id}/close`
- **Inventory:**
  - `GET|POST /ingredients`, `PUT /ingredients/{id}`, `POST /ingredients/{id}/adjust`
  - `GET /stock-movements`
  - `GET|POST /suppliers`
  - `POST /stock-receipts`
  - `GET|PUT /products/{id}/recipe`
- **Reports:** `GET /reports/summary?from&to`, `GET /reports/sales.csv`, `GET /audit`

## Platform (is_platform_admin)
`GET /platform/organizations`, `PATCH /platform/organizations/{id}` (status, feature_flags), `GET /platform/audit`.

## Realtime (Reverb / Pusher protocol)
- **Staff:** private channel `branch.{id}` (auth via `/api/broadcasting/auth`). Events: `order.created|updated`, `prep.updated`, `check.updated`, `table.updated`, `request.created|updated`, `payment.captured`, `stock.low`.
- **Guests:** channel `guest.{guestToken}`. Events: `order.updated`, `session.updated`.

A machine-readable OpenAPI file has not been written yet; see PROJECT_STATUS.
