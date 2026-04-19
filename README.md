# Labb Pricing App

Complex pricing, contracts, and in-app e-sign for Labb clinics and their clients.

**Status:** scaffold v0.1 — foundation only. Feature routes return `501 not_implemented` until built out.

## What this app does

- **Pricing buckets** — reusable price lists (product, UoM, unit price, total price, notes). Copy a bucket, tweak it, assign to another clinic.
- **Clinics & clients** — one parent clinic can have many clients (e.g. 250). Each client signs its own contract.
- **Special (conditional) pricing** — one-off overrides on top of a client's bucket: time-limited, single-order, or clinic-specific.
- **Labb cost of goods** — stored per product so margin can be tracked.
- **Contract templates + e-sign** — editable templates with merge fields. Clinic signs first, Labb counter-signs. Immutable PDF snapshot on signing.
- **Audit log** — every pricing and contract change tracked.
- **Roles** — Labb staff: `admin`, `sales`, `legal`, `finance`. Clinics: `clinic_admin`, `clinic_user`.

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
| `users` | Labb staff + clinic logins (role-based) |
| `clinics` | Parent organizations |
| `clients` | Individual clients under a clinic |
| `products` | Catalog w/ `labb_cost` for margin |
| `pricing_buckets` + `bucket_items` | Reusable price lists |
| `client_bucket_assignments` | Which bucket each client is on |
| `special_pricing` | Conditional per-product overrides |
| `contract_templates` | Editable templates w/ merge fields |
| `contracts` | Per-client signed instance + immutable pricing snapshot |
| `signatures` | Clinic + Labb counter-signatures (IP, timestamp) |
| `email_invites` | Magic links for new client user onboarding |
| `audit_log` | Every pricing/contract/user change |

## Next milestones

1. Products CRUD + margin-aware pricing
2. Pricing buckets CRUD + copy
3. Clinics & clients CRUD + bulk import
4. Special pricing UI + expiration enforcement
5. Contract template editor + merge field engine
6. E-sign flow + PDF snapshot (local disk → R2 later)
7. Clinic portal (login, view my pricing, sign contracts)
8. Audit log viewer + margin dashboard
