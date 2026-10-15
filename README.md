# Sentinel NMS

Sentinel NMS is a self-hosted network monitoring MVP for MikroTik and other SNMP-enabled devices. The monorepo contains an Express/Prisma API and a React/Vite dashboard.

## Run with Docker Compose

Requirements: Docker Engine with the Compose plugin.

Before first startup, create a project-root `.env` file and set an initial admin email and a unique password of at least 12 characters:

```dotenv
AUTH_INITIAL_ADMIN_EMAIL=admin@example.com
AUTH_INITIAL_ADMIN_PASSWORD=replace-with-a-long-random-password
```

Then run:

```sh
docker compose up --build
```

Compose starts the API, a separate polling worker, and the web app. The worker starts after the API has applied database migrations and passed its health check.

Open `http://localhost:8080` and sign in with that account. The initial account is created as Super Admin only when the database has no users; the password is never reset from environment variables on later restarts. Remove `AUTH_INITIAL_ADMIN_PASSWORD` from the environment after the first successful startup. Set `AUTH_COOKIE_SECURE=true` when serving the site over HTTPS, and set `WEB_ORIGINS` to the exact public web origin(s), comma-separated. Set `WEB_PORT` to change the published port. SQLite data and daily database backups are stored in the persistent `sentinel_data` volume; backups are retained for seven days by default. Database migrations are applied when the API starts.

## Run locally

Requirements: Node.js 22 or newer and npm. Run all commands below from the repository root (`sentinel-nms`), not from `apps/api` or `apps/web`.

### One-time setup

Open one terminal at the repository root and install dependencies:

```powershell
npm ci
```

Create the local API environment file from the example:

```powershell
Copy-Item apps\api\.env.example apps\api\.env
```

Edit `apps/api/.env` and set `AUTH_INITIAL_ADMIN_EMAIL` and a unique `AUTH_INITIAL_ADMIN_PASSWORD` of at least 12 characters. This account is created only if the database has no users. Keep the database URL from the example to use the local SQLite database at `apps/api/prisma/dev.db`.

Before starting the API for the first time, run the configuration preflight:

```powershell
npm run preflight
```

It validates the initial admin settings, port/origins, backup retention, and encryption keys against any encrypted credentials or notification channels already stored in the database. Missing encryption keys are warnings only while no saved data needs them; configure each key before creating data that uses it. The API and worker repeat the same validation at startup. The preflight command does not create users, change existing records, or print secret values.

### Every time you start the app

You need **three terminals** open at the repository root. Start them in this order:

**Terminal 1 — API and database migrations**

```powershell
npm run api
```

Wait until the terminal says `Sentinel NMS API` and `Status : Running`. The API prepares the Prisma client if it is missing and applies pending database migrations on startup.

**Terminal 2 — polling worker**

```powershell
npm run worker
```

Wait until you see `[Worker] Starting polling and retention scheduler.` Leave this terminal running; it processes scheduled and manually requested device polls.

**Terminal 3 — web app**

```powershell
npm run web
```

When Vite says it is ready, open **http://localhost:5173** and sign in with the initial admin account you configured. The web app proxies API requests to `http://localhost:3000`.

Leave all three terminals running while using the app. To stop it, press `Ctrl+C` in each terminal. Do not start a second API or worker for the same local database.

The worker creates one consistent SQLite backup per UTC day, on its first scheduler tick after startup. It reuses the day's backup after a worker restart. Local backups are written to `apps/api/backups` by default and older backups are removed after seven days. Backup files are named `sentinel-YYYYMMDD.db`. Backups contain the full monitoring database, including encrypted credentials, so protect the folder and keep the matching `ALERT_ENCRYPTION_KEY` and `DEVICE_ENCRYPTION_KEY` available.

You can override the backup location and retention in `apps/api/.env`:

```dotenv
SQLITE_BACKUP_DIR=backups
SQLITE_BACKUP_RETENTION_DAYS=7
```

`SQLITE_BACKUP_DIR` may be absolute or relative to `apps/api`. Retention must be between 1 and 3650 days.

To restore a local backup, stop the API and worker, then copy the latest backup over the database and retain the current file as a precaution:

```powershell
$backup = Get-ChildItem apps\api\backups\sentinel-*.db | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Copy-Item apps\api\prisma\dev.db apps\api\prisma\dev.db.before-restore
Copy-Item $backup.FullName apps\api\prisma\dev.db -Force
```

Restart the API and worker afterwards. For Docker, stop both services, select a backup filename, and copy it inside a one-off container using the persistent volume:

```powershell
docker compose stop api worker
$backup = "sentinel-YYYYMMDD.db"
docker compose run --rm --no-deps --entrypoint sh api -c "cp /data/sentinel.db /data/sentinel-before-restore.db && cp /data/backups/$backup /data/sentinel.db"
docker compose up -d api worker
```

Replace the example filename with a file present in `/data/backups`. Never copy or replace the live SQLite database while the API or worker is running.

### Backup restore verification

Before relying on backups for recovery, verify the full SQLite backup-and-restore path against temporary databases:

```powershell
npm run verify:backup
```

This test creates a disposable database, makes a backup through SQLite's online backup operation, restores it to a second disposable database, and checks both its integrity and contents. It does not read or replace the live application database.

### Worker recovery verification

Run the worker job and abandoned-job recovery smoke tests with:

```powershell
npm run verify:worker
```

The recovery test marks a job as stale in a disposable SQLite database, runs the same recovery query used by the worker, and verifies that only the stale job is requeued. This checks recovery behavior but is not a substitute for the 24–48 hour lab soak test or validation against real MikroTik traffic.

### After changing Prisma models

Stop both the API and worker first, then regenerate the client from the repository root:

```powershell
npm run db:generate --workspace=api
```

Start the API, worker, and web app again using the three-terminal steps above.

Optional API configuration belongs in `apps/api/.env`; use `apps/api/.env.example` as the template. `DATABASE_URL` is required in production and defaults to a local SQLite database only in development.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode. Production requires an explicit `DATABASE_URL`. |
| `PORT` | `3000` | API listening port. |
| `DATABASE_URL` | `file:./dev.db` in development | Prisma database connection string. |
| `SQLITE_BACKUP_DIR` | `apps/api/backups` locally; `/data/backups` in Compose | Destination for daily SQLite backups; relative paths resolve from `apps/api`. |
| `SQLITE_BACKUP_RETENTION_DAYS` | `7` | Number of days to keep backups (1–3650); configure this in `apps/api/.env` locally or the project-root `.env` for Compose. |
| `AUTH_INITIAL_ADMIN_EMAIL` | Empty | Email for the first Super Admin; required when the database has no users. |
| `AUTH_INITIAL_ADMIN_PASSWORD` | Empty | First Super Admin password (12–128 characters); remove after account creation. |
| `AUTH_COOKIE_SECURE` | `false` | Set to `true` when HTTPS is terminated in front of the app. |
| `WEB_ORIGINS` | Local development origins | Comma-separated exact browser origins allowed by CORS and state-changing request checks. |
| `TRUST_PROXY` | `0` | Set to `1` only behind a trusted reverse proxy, so client IP handling is correct. |
| `ALERT_ENCRYPTION_KEY` | Unset | Separate private key (at least 32 characters) required to store notification-channel secrets. |
| `DEVICE_ENCRYPTION_KEY` | Unset | Separate private key (at least 32 characters) required to store SNMPv3 and RouterOS credentials. |
| `WEB_PORT` | `8080` | Host port published by Docker Compose for the web app. |
| `API_PROXY_TARGET` | `http://localhost:3000` | API target used by the Vite development proxy. |

Docker Compose reads its variables from the project-root `.env`; local API settings belong in `apps/api/.env`. The web development proxy variable is set in the shell when starting the web workspace.

## Current capabilities

- Device inventory CRUD, enable/disable, SNMP v1/v2c configuration, device groups, and tags.
- SNMPv3 polling with noAuthNoPriv, authNoPriv, and authPriv security levels.
- Configurable scheduled SNMP polling, a manual `POST /api/v1/metrics/poll` endpoint, and bounded concurrent polling.
- Scheduled and manually requested polling run in a separate worker process; manual polling is queued durably in the shared database.
- System inventory: SNMP hostname, system description, contact/location (when configured), uptime, MikroTik CPU load or generic HOST-RESOURCES CPU, memory totals/use, and storage volumes (when exposed by the device).
- Per-core CPU utilization when the device exposes HOST-RESOURCES-MIB processor entries.
- Interface inventory: name/alias, type, admin/operational state, MTU, speed, MAC, IPv4 addresses, packet counts, inbound/outbound bytes, errors, and discards where available.
- Device status overview, CPU history, traffic charts, and expanded system/interface details.
- Device CPU, RAM, and interface traffic charts support history windows from 5 minutes up to 6 months, plus custom day/hour ranges; long windows are downsampled for display.
- Persistent device and port outage history with first-observed down time, recovery time, duration, and interface name.
- CPU threshold and offline-duration alert rules, alert acknowledgment/history, and webhook, Telegram, and SMTP notification channels.
- Polling interval and metric retention settings. Retention deletes metric samples older than the configured number of days.
- Authorized private-network SNMP discovery (maximum 256 IPv4 addresses per scan).
- Read-only MikroTik RouterOS v7 system, interface, simple queue, and active firewall connection queries over HTTPS REST.
- Metric and alert history exports in Excel (.xlsx) and PDF format.
- Session-cookie authentication with HttpOnly cookies, bcrypt password hashing (cost 12), Super Admin/Admin/Viewer roles, user management, and session revocation on password change or account disable. Existing scrypt password hashes are upgraded after successful sign-in.
- Super Admin audit history for state-changing API requests and authentication attempts; request bodies and credentials are not recorded.
- Responsive mobile navigation, persistent light/dark appearance preference, and explicit loading/error states on primary monitoring views.
- API health endpoint at `GET /api/v1/health`.

API routes are prefixed with `/api/v1`; only the health endpoint and sign-in endpoint are public. Viewer accounts have read-only access; Admin accounts can manage monitoring resources, while system settings and user management are restricted to Super Admin. Session cookies are HttpOnly and SameSite=Strict, mutation requests require an allowed Origin, and sign-in attempts are rate-limited. Device secrets are not returned in API responses.

New passwords use bcrypt with a cost factor of 12. Password input is SHA-256 pre-hashed before bcrypt so the full supported 12–128 character password is checked despite bcrypt's 72-byte input limit. Existing scrypt hashes remain verifiable and are transparently re-hashed with bcrypt after a successful login.

To configure delivery channels, set `ALERT_ENCRYPTION_KEY` in `apps/api/.env` to a private random value of at least 32 characters. Before saving SNMPv3 or RouterOS credentials, also set `DEVICE_ENCRYPTION_KEY` to a separate private random value of at least 32 characters. The example file includes generation commands. Keep both keys backed up: encrypted credentials in SQLite cannot be decrypted if their key is lost or changed. Docker Compose reads these values from the project-root `.env`.

## API quick reference

All endpoints use the `/api/v1` prefix and JSON request/response bodies unless they return a report file. Authenticated browser requests use the `sentinel_session` HttpOnly cookie. Send an allowed `Origin` header on every state-changing request. The health check and login are public; all other endpoints require authentication.

| Method | Endpoint | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/health` | API health and uptime | Public |
| `POST` | `/auth/login` | Sign in; sets the session cookie | Public, rate-limited |
| `GET` | `/auth/me` | Current account and session | Authenticated |
| `POST` | `/auth/logout` | End current session | Authenticated |
| `POST` | `/auth/password` | Change current password and revoke other sessions | Authenticated |
| `GET`, `POST` | `/users` | List or create accounts | Super Admin |
| `PATCH`, `DELETE` | `/users/:id` | Update or delete an account | Super Admin |
| `GET`, `POST` | `/devices` | List or create devices | Authenticated read; Admin/Super Admin write |
| `GET`, `PATCH`, `DELETE` | `/devices/:id` | Read, update, or delete a device | Authenticated read; Admin/Super Admin write |
| `GET` | `/devices/:id/routeros` | Read RouterOS device data | Authenticated |
| `GET` | `/dashboard/summary`, `/dashboard/devices`, `/dashboard/devices/:id` | Dashboard overview and device details | Authenticated |
| `GET` | `/metrics/device/:id` | Device metric history | Authenticated |
| `GET` | `/metrics/device/:id/interfaces` | Interface inventory and current counters | Authenticated |
| `GET` | `/metrics/device/:id/events` | Device and interface outage history | Authenticated |
| `GET` | `/metrics/device/:id/summary` | Device metric summary | Authenticated |
| `POST` | `/metrics/poll` | Queue a polling cycle; returns a job ID | Admin/Super Admin |
| `GET` | `/metrics/poll/:id` | Read queued/running/completed/failed polling job status | Authenticated |
| `GET`, `POST` | `/groups` | List or create device groups | Authenticated read; Admin/Super Admin write |
| `PATCH`, `DELETE` | `/groups/:id` | Update or delete a group | Admin/Super Admin |
| `PUT` | `/groups/devices/:id` | Assign device group membership | Admin/Super Admin |
| `GET`, `PATCH` | `/settings` | Read or update system settings | Authenticated read; Super Admin write |
| `GET`, `POST`, `PATCH`, `DELETE` | `/alerts/rules` | Manage alert rules | Authenticated read; Admin/Super Admin write |
| `GET`, `PATCH` | `/alerts/events`, `/alerts/events/:id/acknowledge` | Read or acknowledge alert history | Authenticated read; Admin/Super Admin write |
| `GET`, `POST`, `PATCH`, `DELETE` | `/alerts/channels` | Manage notification channels | Authenticated read; Admin/Super Admin write |
| `POST` | `/alerts/channels/test` | Send a test notification | Admin/Super Admin |
| `POST` | `/discovery/scan` | Discover SNMP devices on a private subnet | Admin/Super Admin |
| `GET` | `/reports/:type/:format` | Export metric or alert history (`xlsx` or `pdf`) | Authenticated |
| `GET` | `/audit-log` | Paginated audit history | Super Admin |

For request validation rules and response shapes, see the module validators/controllers in `apps/api/src/modules`. Errors use a JSON object with `success: false`, a human-readable `message`, and optional `errors` details.

## Current limitations / next phases

RouterOS integration currently supports read-only REST endpoints on RouterOS v7 over HTTPS with a valid TLS certificate; it does not change device configuration. RouterOS live inspection includes interfaces, simple queues, and active firewall connection metadata, capped at 500 queue and 500 connection entries per request. Queue targets and firewall connections are not guaranteed to map one-to-one to individual users. Per-core CPU readings depend on the device exposing HOST-RESOURCES-MIB processor entries. History chart queries return at most 1,000 points per series. The available history depends on the configured metric retention period; selecting a longer window does not restore metrics already deleted by retention. Outage history starts collecting after the outage-event migration is installed and is not backfilled from older metric samples. Outage timing is based on polling observations, so actual failure/recovery times may differ by up to one polling interval. Discovery supports SNMP v1/v2c only and is restricted to RFC1918 private subnets of at most 256 addresses. Reports are limited to 31 days, 50,000 rows for Excel, and 5,000 rows for PDF. Poll jobs are stored in the shared SQLite database and old completed jobs are pruned after seven days; run one worker instance with the current SQLite deployment. CSV import, SNMPv3 discovery, multi-tenancy, and PostgreSQL remain future work.
