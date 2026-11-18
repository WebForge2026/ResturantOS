# Test deployment: Vercel + Neon (temporary database)

Three Vercel projects from **one** GitHub repo, plus a free Neon Postgres database:

| Vercel project | Root Directory | What |
|---|---|---|
| `noar-api` | `backend` | Laravel API (PHP runtime `vercel-php`) |
| `noar-staff` | `apps/ops` | Staff portal (POS, kitchen, bar, waiter, admin) |
| `noar-menu` | `apps/qr-menu` | Guest QR menu |

> **For testing only.**
> - Payments are simulated and there is no fiscal device.
> - Vercel has no WebSocket server, so screens refresh every few seconds instead of instantly.
> - Photos uploaded on Vercel are not stored permanently. The Wolt menu photos ship with the apps.

## 1. Database (Neon, free)
1. Sign in at https://neon.tech with GitHub → **New Project** (region: *Europe (Frankfurt)*).
2. Under **Connection string**, copy the **"Pooled connection"** variant:
   `postgresql://USER:PASSWORD@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`

## 2. Backend `noar-api`
Vercel → **Add New → Project** → repo `WebForge2026/ResturantOS` → branch `claude/confident-wozniak-gj2rs1`.
- **Root Directory:** `backend`
- **Framework Preset:** Other
- **Environment Variables** (paste all):

```
APP_NAME=NOAR RestaurantOS
APP_ENV=demo
APP_DEBUG=false
APP_KEY=<from the chat>
APP_URL=https://noar-api.vercel.app
DB_CONNECTION=pgsql
DB_URL=<Neon connection string>
CACHE_STORE=database
SESSION_DRIVER=array
QUEUE_CONNECTION=sync
LOG_CHANNEL=stderr
BROADCAST_CONNECTION=log
MAIL_MAILER=log
NOAR_DEMO_TABLE_LOOKUP=true
NOAR_DEMO_PASSWORD=<your own demo password, min. 10 characters>
NOAR_SETUP_KEY=<from the chat>
CORS_ALLOWED_ORIGINS=*
```

Click **Deploy** and note the address, e.g. `https://noar-api.vercel.app`.
Check in the browser: `https://noar-api.vercel.app/api/v1/system/status` should show `"database":true`.

## 3. Fill the database (once)
Run in a terminal (on Windows PowerShell use `curl.exe` instead of `curl`):

```bash
curl -X POST -H "X-Setup-Key: <NOAR_SETUP_KEY>" -H "Accept: application/json" https://noar-api.vercel.app/api/v1/system/setup
```

The answer `{"ok":true,...}` means the tables, the NOAR menu (98 dishes), 15 tables and the demo accounts were created.
Append `?history=1` to the URL to also generate 6 days of sample sales (takes longer).
**Afterwards**, delete `NOAR_SETUP_KEY` in Vercel and redeploy. Otherwise anyone with the key could reset everything.

## 4. Staff portal `noar-staff`
New Vercel project, same repo and branch.
- **Root Directory:** `apps/ops`
- **Framework:** Vite
- **Environment Variables:**

```
VITE_API_ORIGIN=https://noar-api.vercel.app
VITE_REALTIME=off
```

Log in with `owner@noar.local`, `cashier@noar.local`, `waiter@noar.local`, `kitchen@noar.local`, `bar@noar.local`,
`manager@noar.local` or `stock@noar.local`. The password is your `NOAR_DEMO_PASSWORD`. Sign-up works too.

## 5. QR menu `noar-menu`
New Vercel project, same repo and branch.
- **Root Directory:** `apps/qr-menu`
- **Framework:** Next.js
- **Environment Variables:**

```
NOAR_API_ORIGIN=https://noar-api.vercel.app
NEXT_PUBLIC_REALTIME=off
```

Open it at `https://noar-menu.vercel.app/?table=4`. For real QR codes, go to **Admin → QR кодове** in the staff portal
and enter the menu address as "Адрес на QR менюто".

## Hardening later / tearing down
- Set `CORS_ALLOWED_ORIGINS` to the portal address, e.g. `https://noar-staff.vercel.app`.
- Set `NOAR_DEMO_TABLE_LOOKUP=false` once only real QR codes (`?t=…`) are used.
- To remove everything, delete the three Vercel projects and the Neon project.
