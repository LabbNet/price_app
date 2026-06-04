# Inventory App

A standalone, warehouse-centric inventory tracker that lives alongside the Labb
Pricing App in this repo but is completely independent of it (own backend, own
database, own frontend).

**Focus:** locations / warehouses — track what stock you have, in which
warehouse, and move it around (receive, ship, adjust, transfer).

## Layout

```
inventory_app/
├── backend/      Express + Knex + SQLite
│   ├── db/       migrations, seeds, knex instance
│   ├── routes/   health, warehouses, items, stock, movements
│   ├── services/ inventory movement engine
│   └── server.js
└── frontend/     Vite + React + React Router
```

## Data model

| Table | Purpose |
|---|---|
| `warehouses` | Physical stock locations (code, name, address) |
| `items` | The catalog of things you stock (SKU, unit, reorder point) |
| `stock_levels` | Quantity on hand per `(item, warehouse)` |
| `stock_movements` | Immutable log of every stock change (receive / ship / adjust / transfer) |

Every stock change goes through a movement, so `stock_levels` is always the
running total of the `stock_movements` log — the log is the source of truth.

## Local dev

Requires Node 20+. No external database needed (SQLite file).

```bash
# Backend
cd inventory_app/backend
cp .env.example .env
npm install
npm run migrate
npm run seed        # optional demo data
npm run dev         # :4100

# Frontend (separate terminal)
cd inventory_app/frontend
cp .env.example .env
npm install
npm run dev         # :5273 — proxies /api to :4100
```

Open http://localhost:5273.

## Movement types

| Kind | from | to | Effect |
|---|---|---|---|
| `receive` | — | warehouse | + stock at `to` |
| `ship` | warehouse | — | − stock at `from` |
| `adjust` | — | warehouse | set/correct stock at `to` (signed delta) |
| `transfer` | warehouse | warehouse | − at `from`, + at `to` |

## Notes

This v0.1 has no authentication — it's intended as an internal tool. Add auth
before exposing it publicly.
