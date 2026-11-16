# NutriPantry

A Next.js pantry and recipe recommendation project using PostgreSQL + pgvector.
This is a partial implementation. See [CHECKPOINT.md](CHECKPOINT.md) for status.

## Tech stack and justification

- Next.js 14 App Router and React 18: pages, interactive forms and route handlers.
- PostgreSQL 16: related users, ingredients, recipes and goals need constraints,
  joins, views and transactional writes.
- pgvector: recipes are ranked by meaning using 384-dimensional vectors stored
  next to the relational data, so one SQL query can combine similarity with
  pantry and goal data. HNSW index, cosine distance.
- Transformers.js (`@huggingface/transformers`): runs all-MiniLM-L6-v2 locally in
  Node to embed recipes and search text. Free, no API key, works offline after
  the first model download.
- `pg`: pooled connections and parameterised SQL.
- `bcryptjs` and signed httpOnly cookies: existing password/session implementation.

## Run in the VS Code PowerShell terminal

Start in the repository root:

```powershell
cd nutripantry
npm ci
Copy-Item .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Edit `.env.local`: choose a `PGPASSWORD` and paste the generated value into
`SESSION_SECRET`. These values stay local and are ignored by Git.

Start Docker Desktop, then run:

```powershell
docker compose --env-file .env.local up -d
npm run db:setup
npm run db:embed
npm run dev
```

`db:embed` stores a vector for every recipe. The first run downloads the
embedding model (about 90 MB) once. Re-run it after `db:setup`.

`--env-file .env.local` makes Docker use the same password as Next.js.
For an existing database volume, keep the password used when it was created.
`db:setup` DROPS and recreates the project tables; use it for the demo database
and do not run it against data you need to retain.

Open http://localhost:3000/pantry. Check http://localhost:3000/api/health for
database connectivity. Without Docker, use PostgreSQL 16 with pgvector installed
and set the matching connection values in `.env.local`.

Seeded accounts (the seed file declares the password `password123`):

| Email | Role |
|---|---|
| admin@nutripantry.dev | admin |
| krishna@example.com | user |
| teammate@example.com | user |

The seed hash matches `password123` in an offline bcrypt check; live login still needs verification. Anonymous pantry views
show the existing demo account. Writes require a signed-in session.

## Pantry increment

- Ingredient search and category/freshness filters with result counts.
- Total, expiring-soon and expired summary cards.
- Freshness comes from `v_user_pantry`; the page preserves SQL date values.
- Signed-in users choose a master ingredient and add a positive quantity.
- Existing ingredients are topped up, not replaced. The form uses the existing
  unit (or the master ingredient's default unit) with no unit conversion.
- Optional expiry, save progress, success/error feedback and refreshed data.
- Demo mode stays read-only; empty states and narrow-screen layouts are included.

The form calls the existing `POST /api/pantry`, which invokes
`sp_upsert_pantry_item` in a transaction. Existing DB constraints and triggers
remain responsible for integrity. Blank expiry retains an existing date; the
schema stores one row/date per ingredient, not separate purchase batches.

## Next.js project tree

```text
src/
  app/
    layout.jsx                 shared shell
    globals.css                shared and pantry styles
    page.jsx                   database dashboard
    login/page.jsx             existing login form
    pantry/
      page.jsx                 server-side pantry and ingredient reads
      pantry-workspace.jsx     filters, summaries and add/top-up form
    recommend/
      page.jsx                 stage-1 recommendations, recent searches
      recipe-search.jsx        natural-language search (hybrid / meaning only)
    admin/page.jsx             existing application role guard
    api/
      auth/login/route.js
      health/route.js
      pantry/route.js
      recommend/route.js
  lib/
    auth.js
    db.js
    embeddings.js              re-exports embedder.mjs for route handlers
    embedder.mjs               all-MiniLM-L6-v2 via Transformers.js
scripts/
  setup-db.mjs                 runs db/*.sql in order
  embed.mjs                    npm run db:embed
  search.mjs                   npm run db:search -- "query"
  vector-demo.mjs              npm run db:vector-demo (vector CRUD walkthrough)
  db-client.mjs                .env.local loader + pg client for the scripts
```

SQL files and query examples: [db/README.md](db/README.md).

## Recipe search and recommendations

- `/recommend` has a search box: type a craving ("warm comforting vegetarian
  curry") and choose **Best for me** (hybrid) or **Closest in meaning only**.
- The text is embedded with all-MiniLM-L6-v2 and compared to every recipe vector
  with pgvector's `<=>` (cosine distance) inside PostgreSQL.
- Hybrid ranking, `fn_hybrid_search`: `0.7 × relevance + 0.2 × pantry + 0.1 × goal fit`,
  where relevance is the similarity rescaled so the closest recipe is 1.
  The results table shows every component so the order can be explained.
- Without a typed query, `fn_recommend_recipes` ranks by pantry overlap and goal fit.
- Every search is written to `search_log` in a transaction and listed under
  "Recent searches". If the model cannot load, the API falls back to full-text search.
- Demo SQL: `db/demo/recipe_queries.sql`. Terminal demos: `npm run db:search`,
  `npm run db:vector-demo`.

## Verification

Both changed JSX modules compile through the installed Next.js Babel preset.
A server-render smoke check passed for the guest view without a write form,
signed-in form, SQL date/freshness display, and an empty pantry.
A controlled event-handler check also passed search/filter/reset, the top-up request payload, success refresh, and session-error feedback with preserved form input. These checks mock the API/router; browser interactions and database writes remain unverified.

The production build was attempted but failed with a Node worker memory allocation
error in the development environment. Docker's engine returned an error, so live
login, add/top-up, trigger rejection and database isolation are not verified here.
Run the manual checks in CHECKPOINT.md once the database is available.

The dependency installer also reports the existing Next.js 14.2.5 version as
vulnerable. A framework upgrade and regression check remain separate work before
public deployment.

### Recipe search increment

Checked on PostgreSQL 16.16 with pgvector 0.7.4 (the Docker image ships a newer
pgvector, which also supports HNSW): `db:setup`, `db:embed` (16/16 recipes),
`db/demo/recipe_queries.sql`, `db:search` and `db:vector-demo` all ran without
errors. The embedding output matches the published all-MiniLM-L6-v2 reference
values. `next build` succeeded; with `next start`, sign-in, hybrid and
meaning-only search, the 401 for signed-out requests, search logging and the
full-text fallback were exercised in a headless browser at 1100px and 375px.
Not yet run on the team's own Docker setup.
