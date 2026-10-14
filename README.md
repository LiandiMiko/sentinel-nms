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

Open `http://localhost:8080` and sign in with that account. The initial account is created as Super Admin only when the database has no users; the password is never reset from environment variables on later restarts. Remove `AUTH_INITIAL_ADMIN_PASSWORD` from the environment after the first successful startup. Set `AUTH_COOKIE_SECURE=true` when serving the site over HTTPS, and set `WEB_ORIGINS` to the exact public web origin(s), comma-separated. Set `WEB_PORT` to change the published port. SQLite data is stored in the `sentinel_data` volume and database migrations are applied when the API starts.

## Run locally

Requirements: Node.js 22 or newer and npm.

```sh
npm ci
```

Start the API. On first run, the development command generates the Prisma client and applies migrations automatically. It uses `apps/api/prisma/dev.db` by default:

```sh
npm run api
```

In a second terminal, start the web app:

```sh
npm run web
```

Open `http://localhost:5173`. The Vite development server proxies `/api/v1` to `http://localhost:3000`. To use a different API host, set `API_PROXY_TARGET` before starting the web workspace.

Optional API configuration can be provided in `apps/api/.env`; start from `apps/api/.env.example`. `DATABASE_URL` is required in production and defaults to a local SQLite database only in development. The local API also requires `AUTH_INITIAL_ADMIN_EMAIL` and `AUTH_INITIAL_ADMIN_PASSWORD` on first startup; use a unique password of at least 12 characters.

## Current capabilities

- Device inventory CRUD, enable/disable, SNMP v1/v2c configuration, device groups, and tags.
- SNMPv3 polling with noAuthNoPriv, authNoPriv, and authPriv security levels.
- Configurable scheduled SNMP polling, a manual `POST /api/v1/metrics/poll` endpoint, and bounded concurrent polling.
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
- Session-cookie authentication with HttpOnly cookies, password hashing, Super Admin/Admin/Viewer roles, user management, and session revocation on password change or account disable.
- API health endpoint at `GET /api/v1/health`.

API routes are prefixed with `/api/v1`; only the health endpoint and sign-in endpoint are public. Viewer accounts have read-only access; Admin accounts can manage monitoring resources, while system settings and user management are restricted to Super Admin. Session cookies are HttpOnly and SameSite=Strict, mutation requests require an allowed Origin, and sign-in attempts are rate-limited. Device secrets are not returned in API responses.

To configure delivery channels, set `ALERT_ENCRYPTION_KEY` in `apps/api/.env` to a private random value of at least 32 characters. Before saving SNMPv3 or RouterOS credentials, also set `DEVICE_ENCRYPTION_KEY` to a separate private random value of at least 32 characters. The example file includes generation commands. Keep both keys backed up: encrypted credentials in SQLite cannot be decrypted if their key is lost or changed. Docker Compose reads these values from the project-root `.env`.

## Current limitations / next phases

RouterOS integration currently supports read-only REST endpoints on RouterOS v7 over HTTPS with a valid TLS certificate; it does not change device configuration. RouterOS live inspection includes interfaces, simple queues, and active firewall connection metadata, capped at 500 queue and 500 connection entries per request. Queue targets and firewall connections are not guaranteed to map one-to-one to individual users. Per-core CPU readings depend on the device exposing HOST-RESOURCES-MIB processor entries. History chart queries return at most 1,000 points per series. The available history depends on the configured metric retention period; selecting a longer window does not restore metrics already deleted by retention. Outage history starts collecting after the outage-event migration is installed and is not backfilled from older metric samples. Outage timing is based on polling observations, so actual failure/recovery times may differ by up to one polling interval. Discovery supports SNMP v1/v2c only and is restricted to RFC1918 private subnets of at most 256 addresses. Reports are limited to 31 days, 50,000 rows for Excel, and 5,000 rows for PDF. CSV import, SNMPv3 discovery, multi-tenancy, PostgreSQL, and worker separation remain future work. Docker Compose currently uses SQLite and a single API process.
