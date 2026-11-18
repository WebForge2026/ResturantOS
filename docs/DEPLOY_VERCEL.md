# Test-Deployment: Vercel + Neon (temporäre Datenbank)

Drei Vercel-Projekte aus **einem** GitHub-Repo, plus eine kostenlose Neon-Postgres-Datenbank:

| Vercel-Projekt | Root Directory | Was |
|---|---|---|
| `noar-api` | `backend` | Laravel-API (PHP-Runtime `vercel-php`) |
| `noar-staff` | `apps/ops` | Personal-Portal (POS, Küche, Bar, Kellner, Admin) |
| `noar-menu` | `apps/qr-menu` | QR-Menü für Gäste |

> **Nur zum Testen.** Zahlungen sind simuliert, es gibt keine Fiskalkasse. Auf Vercel gibt es keinen
> WebSocket-Server: Die Bildschirme aktualisieren sich alle paar Sekunden statt sofort. Hochgeladene
> Fotos bleiben auf Vercel nicht dauerhaft gespeichert; die Fotos aus dem Wolt-Menü werden mit ausgeliefert.

## 1. Datenbank (Neon, kostenlos)
1. Auf https://neon.tech mit GitHub anmelden → **New Project** (Region: *Europe (Frankfurt)*).
2. Unter **Connection string** die Variante **„Pooled connection“** kopieren:
   `postgresql://USER:PASSWORT@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`

## 2. Backend `noar-api`
Vercel → **Add New → Project** → Repo `WebForge2026/ResturantOS` → Branch `claude/confident-wozniak-gj2rs1`.
- **Root Directory:** `backend`
- **Framework Preset:** Other
- **Environment Variables** (alle einfügen):

```
APP_NAME=NOAR RestaurantOS
APP_ENV=demo
APP_DEBUG=false
APP_KEY=<aus dem Chat>
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
NOAR_DEMO_PASSWORD=<eigenes Demo-Passwort, mind. 10 Zeichen>
NOAR_SETUP_KEY=<aus dem Chat>
CORS_ALLOWED_ORIGINS=*
```

**Deploy** klicken. Danach die Adresse notieren, z. B. `https://noar-api.vercel.app`.
Test im Browser: `https://noar-api.vercel.app/api/v1/system/status` → `"database":true`.

## 3. Datenbank einmalig befüllen
In einem Terminal (Windows PowerShell: `curl.exe` statt `curl`):

```bash
curl -X POST -H "X-Setup-Key: <NOAR_SETUP_KEY>" -H "Accept: application/json" https://noar-api.vercel.app/api/v1/system/setup
```

Antwort `{"ok":true,...}` = Tabellen, NOAR-Menü (98 Gerichte), 15 Tische und Demo-Konten sind angelegt.
Mit `?history=1` am Ende werden zusätzlich 6 Tage Beispiel-Umsätze erzeugt (dauert länger).
**Danach** in Vercel `NOAR_SETUP_KEY` löschen und neu deployen (sonst könnte jemand mit dem Schlüssel alles zurücksetzen).

## 4. Personal-Portal `noar-staff`
Neues Vercel-Projekt, gleiches Repo/Branch.
- **Root Directory:** `apps/ops` · **Framework:** Vite
- **Environment Variables:**

```
VITE_API_ORIGIN=https://noar-api.vercel.app
VITE_REALTIME=off
```

Login: `owner@noar.local`, `cashier@noar.local`, `waiter@noar.local`, `kitchen@noar.local`, `bar@noar.local`,
`manager@noar.local`, `stock@noar.local` — Passwort = `NOAR_DEMO_PASSWORD`. Registrieren geht auch.

## 5. QR-Menü `noar-menu`
Neues Vercel-Projekt, gleiches Repo/Branch.
- **Root Directory:** `apps/qr-menu` · **Framework:** Next.js
- **Environment Variables:**

```
NOAR_API_ORIGIN=https://noar-api.vercel.app
NEXT_PUBLIC_REALTIME=off
```

Aufruf: `https://noar-menu.vercel.app/?table=4`. Für echte QR-Codes im Portal unter **Admin → QR кодове**
als „Адрес на QR менюто“ die Menü-Adresse eintragen.

## Später absichern / abbauen
- `CORS_ALLOWED_ORIGINS` auf die Portal-Adresse setzen, z. B. `https://noar-staff.vercel.app`.
- `NOAR_DEMO_TABLE_LOOKUP=false`, sobald nur noch echte QR-Codes (`?t=…`) benutzt werden.
- Zum Löschen: die drei Vercel-Projekte und das Neon-Projekt löschen.
