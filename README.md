# Sentinel NMS

Sentinel NMS is a self-hosted network monitoring MVP for MikroTik and other SNMP-enabled devices. The monorepo contains an Express/Prisma API and a React/Vite dashboard.

## Run with Docker Compose

Requirements: Docker Engine with the Compose plugin.

```sh
docker compose up --build
```

Open `http://localhost:8080`. Set `WEB_PORT` to change the published port. SQLite data is stored in the `sentinel_data` volume and database migrations are applied when the API starts.

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

Optional API configuration can be provided in `apps/api/.env`; start from `apps/api/.env.example`. `DATABASE_URL` is required in production and defaults to a local SQLite database only in development.

## Current capabilities

- Device inventory CRUD, enable/disable, and SNMP v1/v2c configuration.
- Scheduled SNMP polling every 30 seconds, a manual `POST /api/v1/metrics/poll` endpoint, and bounded concurrent polling.
- System name, uptime, MikroTik CPU load, interface names/status, and inbound/outbound interface counters (64-bit counters with legacy fallback).
- Device status overview, CPU history, and per-interface traffic charts.
- API health endpoint at `GET /api/v1/health`.

API routes are prefixed with `/api/v1`. Device secrets are not returned in API responses.

## Current limitations / next phases

This repository remains an MVP. Authentication/RBAC, credential encryption at rest, alert rules and delivery channels, retention settings, import/reporting, SNMP v3, discovery, multi-tenancy, PostgreSQL, and worker separation are not implemented yet. Do not expose the unauthenticated API directly to an untrusted network; deploy it behind a trusted network boundary until authentication is added. Docker Compose currently uses SQLite and a single API process.
