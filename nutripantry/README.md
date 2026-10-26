# NutriPantry

**Goal-based recipe recommendation from available pantry ingredients**

DBMS Experiential Learning — Level 3 Mini Project

---

## Problem statement

People throw away food they already own while ordering something else for dinner,
and people tracking calories give up because planning a meal that both *fits the
goal* and *uses what's in the fridge* takes more effort than it's worth.

NutriPantry takes the ingredients a user already has, plus their calorie and
macronutrient goal, and ranks the recipes they can actually cook right now.

## Why two database paradigms

| Data | Store | Why |
|---|---|---|
| Users, pantry stock, recipes, nutrition values, goals | **PostgreSQL** | Highly structured, relational, needs joins, constraints and transactional integrity |
| Recipe descriptions and instructions | **pgvector** (384-dim embeddings) | Free-text that users query by meaning — "something creamy but not too spicy" — which no `WHERE` clause can express |

The recommender is genuinely two-stage, which is why both are needed:

1. **Stage 1 (SQL)** — filter and rank by pantry overlap and calorie fit.
   Pure relational work: joins, aggregates, `HAVING`, a stored function.
2. **Stage 2 (vector)** — re-rank that candidate set by cosine similarity
   against the user's free-text craving.

---

## Tech stack

- **Frontend / API** — Next.js 14 (App Router, server components + route handlers)
- **Database** — PostgreSQL 16 with the `pgvector` extension
- **Driver** — `pg` (parameterised queries only)
- **Auth** — bcrypt password hashing, signed httpOnly session cookie, two roles

---

## Setup

### 1. Start PostgreSQL

```bash
docker compose up -d
```

This runs `pgvector/pgvector:pg16` on port 5432 with the database, user and
extension ready.

> No Docker? Install PostgreSQL 16 and the pgvector extension manually, then
> create a database called `nutripantry`.

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and set `PGPASSWORD` and `SESSION_SECRET`. Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env.local` is gitignored — **no credential is ever committed or hard-coded.**

### 3. Create the schema and load demo data

```bash
npm install
npm run db:setup
```

This executes `db/01_schema.sql` through `db/06_seed.sql` in order.

### 4. Run the app

```bash
npm run dev
```

Open <http://localhost:3000>. Check <http://localhost:3000/api/health> first —
it reports the PostgreSQL version, the pgvector version and the table count.

### Demo accounts

All use the password `password123`.

| Email | Role |
|---|---|
| `admin@nutripantry.dev` | admin |
| `krishna@example.com` | user |
| `teammate@example.com` | user |

---

## Project layout

```
nutripantry/
├── db/
│   ├── 01_schema.sql      tables, PK/FK, CHECK + UNIQUE constraints
│   ├── 02_indexes.sql     B-tree, partial, GIN full-text, ivfflat vector
│   ├── 03_views.sql       4 views
│   ├── 04_functions.sql   stored functions + a transactional procedure
│   ├── 05_triggers.sql    3 triggers
│   └── 06_seed.sql        demo users, ingredients, recipes, pantries
├── scripts/
│   ├── setup-db.mjs       runs every db/*.sql in order
│   └── embed.mjs          embedding pipeline (checkpoint 2)
├── src/
│   ├── lib/
│   │   ├── db.js          pooled connection + withTransaction()
│   │   ├── auth.js        bcrypt + signed session cookie
│   │   └── embeddings.js  vector helpers
│   └── app/
│       ├── page.jsx       dashboard — live counts from the database
│       ├── pantry/        pantry listing (reads v_user_pantry)
│       ├── recommend/     stage-1 recommendations
│       ├── admin/         admin-only dashboards
│       ├── login/         sign-in form
│       └── api/           health, auth, pantry, recommend
├── docker-compose.yml
└── .env.example
```

---

## Requirement coverage

| # | Requirement | Where |
|---|---|---|
| 3 | Two paradigms: SQL + vector | PostgreSQL + pgvector |
| 4 | ER diagram + relational schema | design document, `db/01_schema.sql` |
| 5 | CREATE / ALTER / DROP, keys, constraints, indexes, views | `db/01`–`db/03` |
| 6 | INSERT / UPDATE / DELETE / SELECT, JOIN, GROUP BY, HAVING, subqueries | `db/03_views.sql`, `src/app/page.jsx`, API routes |
| 7 | ≥ 4 advanced features | views, stored procedures/functions, triggers, indexing, full-text search, transactions, vector search — **7** |
| 8 | Vector / semantic search | `db/02` index, `src/lib/embeddings.js`, `/api/recommend` |
| 9 | Next.js interface | `src/app/` |
| 10 | API layer, env vars, no hard-coded credentials | `src/lib/db.js`, `.env.example` |
| 11 | Auth + ≥ 2 roles | `src/lib/auth.js`, `/admin` guard |
| 12 | Validation and integrity at DB level | CHECK constraints, `trg_validate_pantry_item` |
| 13 | Security | bcrypt hashes, parameterised queries, httpOnly signed cookies |
| 15 | Git/GitHub + README | this file |

---

## Status

Checkpoint 1 — schema, seed data and a running app that reads live data.
See `CHECKPOINT.md` for what is done, what is next, and the work split.
