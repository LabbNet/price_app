# Labb Pricing App

Complex pricing, contracts, and in-app e-sign for Labb clients and their clinics.

**Status:** scaffold v0.1 — foundation only. Feature routes return `501 not_implemented` until built out.

## What this app does

- **Pricing buckets** — reusable price lists (product, UoM, unit price, total price, notes). Copy a bucket, tweak it, assign to another client.
- **Clients & clinics** — one parent client can have many clinics (e.g. 250). Each clinic signs its own contract.
- **Special (conditional) pricing** — one-off overrides on top of a clinic's bucket: time-limited, single-order, or client-specific.
- **Labb cost of goods** — stored per product so margin can be tracked.
- **Contract templates + e-sign** — editable templates with merge fields. Client signs first, Labb counter-signs. Immutable PDF snapshot on signing.
- **Audit log** — every pricing and contract change tracked.
- **Roles** — Labb staff: `admin`, `sales`, `legal`, `finance`. Clients: `client_admin`, `client_user`.

## Layout

```
price_app/
├── backend/      Express + Postgres + Knex
│   ├── db/       migrations, seeds, knex instance
│   ├── routes/   auth, health, + feature stubs
│   ├── middleware/
│   └── server.js
├── frontend/     Vite + React + React Router + TanStack Query
└── render.yaml   Render blueprint (web API + static web + Postgres)
```

## Local dev

Requires Node 20+ and a running Postgres 15+.

```bash
# 1. Postgres
createdb price_app

# 2. Backend
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL and JWT_SECRET
npm install
npm run migrate
npm run dev          # :4000

# 3. Frontend (separate terminal)
cd ../frontend
cp .env.example .env
npm install
npm run dev          # :5173 — proxies /api to :4000
```

Open http://localhost:5173 — home page pings `/api/health` and reports DB status.

## Deploy (Render)

`render.yaml` is a Render blueprint that provisions:

- `price-app-api` — Node web service, runs migrations on build, serves the API
- `price-app-web` — static site for the frontend
- `price-app-db` — managed Postgres

To deploy: push this repo, then in Render → New → Blueprint, point at the repo. Set `CORS_ORIGIN` on the API service to the web service URL, and `VITE_API_URL` on the web service to the API URL.

## Data model (v0.1)

| Table | Purpose |
|---|---|
| `users` | Labb staff + client logins (role-based) |
| `clients` | Parent organizations |
| `clinics` | Individual clinics under a client |
| `products` | Catalog w/ `labb_cost` for margin |
| `pricing_buckets` + `bucket_items` | Reusable price lists |
| `clinic_bucket_assignments` | Which bucket each clinic is on |
| `special_pricing` | Conditional per-product overrides |
| `contract_templates` | Editable templates w/ merge fields |
| `contracts` | Per-clinic signed instance + immutable pricing snapshot |
| `signatures` | Client + Labb counter-signatures (IP, timestamp) |
| `email_invites` | Magic links for new clinic user onboarding |
| `audit_log` | Every pricing/contract/user change |

## Next milestones

1. Products CRUD + margin-aware pricing
2. Pricing buckets CRUD + copy
3. Clients & clinics CRUD + bulk import
4. Special pricing UI + expiration enforcement
5. Contract template editor + merge field engine
6. E-sign flow + PDF snapshot (local disk → R2 later)
7. Client portal (login, view my pricing, sign contracts)
8. Audit log viewer + margin dashboard
