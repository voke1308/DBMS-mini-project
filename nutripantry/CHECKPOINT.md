# Checkpoint 1 — what to show

## The five-minute demo script

1. `docker compose up -d` — PostgreSQL 16 + pgvector starts.
2. `npm run db:setup` — every `db/*.sql` file runs in order, printing `ok` per file.
3. Open `/api/health` — proves the app reaches the database and that
   **pgvector is installed**, not just planned.
4. Open `/` — the dashboard counts are real `COUNT(*)` queries, and the
   cuisine table is a live `GROUP BY … HAVING … AVG`.
5. Open `/pantry` — reads the `v_user_pantry` **view**; the freshness
   labels (fresh / expiring soon / expired) are computed in SQL, not JS.
6. Open `/recommend` — calls the **stored function** `fn_recommend_recipes`,
   which joins the `v_pantry_match` view against the user's active
   nutrition goal and returns a blended score.
7. Sign in at `/login` as `krishna@example.com`, then visit `/admin` — it
   returns **403**. Sign in as `admin@nutripantry.dev` and it renders.
   That is the role-based access requirement, demonstrated live.
8. Show a trigger firing:

   ```sql
   -- rejected by trg_validate_pantry_item, at the database level
   INSERT INTO pantry_items (user_id, ingredient_id, quantity, unit, expiry_date)
   VALUES (2, 14, 100, 'g', CURRENT_DATE - 5);
   ```

---

## Done

- [x] ER diagram and relational schema
- [x] 9 tables with PK, FK, UNIQUE and CHECK constraints
- [x] `CREATE` / `ALTER` / `DROP` demonstrated
- [x] 4 views
- [x] 2 stored functions + 1 transactional stored procedure
- [x] 3 triggers
- [x] Indexes: B-tree, composite, partial, GIN full-text, ivfflat vector
- [x] Seed data: 3 users, 26 ingredients, 8 recipes, 21 pantry rows
- [x] Next.js app reading live data on 4 pages
- [x] 4 API route handlers
- [x] bcrypt auth with 2 roles and a working `/admin` guard
- [x] Environment-variable configuration, nothing hard-coded
- [x] README with full setup instructions

## Next (checkpoint 2)

- [ ] Source a real recipe dataset (Kaggle: recipes + nutrition) and load ~500 rows
- [ ] Generate embeddings with `all-MiniLM-L6-v2` and populate `recipe_embeddings`
- [ ] Wire stage 2: cosine re-ranking in `/api/recommend` with a real query box
- [ ] Pantry add/edit/delete UI on top of the existing `POST /api/pantry`
- [ ] Nutrition goal editor
- [ ] Ingredient substitution suggestions (vector similarity between ingredients)
- [ ] Middleware-based route protection instead of per-page checks
- [ ] Test cases table for the report

---

## Work split (2 members)

Both members touch the database *and* the application, as the brief requires.

**Member A — database core + recommendation logic**
- `db/01_schema.sql`, `db/02_indexes.sql`, `db/04_functions.sql`
- The recommendation function and its scoring
- `/api/recommend`, `/recommend` page
- Embedding pipeline (`scripts/embed.mjs`) in checkpoint 2

**Member B — data integrity + application shell**
- `db/03_views.sql`, `db/05_triggers.sql`, `db/06_seed.sql`
- Auth, roles and session handling (`src/lib/auth.js`)
- `/login`, `/pantry`, `/admin` pages, `/api/pantry`, `/api/auth/login`
- Docker setup, README, test cases

Keep commits separate per member so the Git history shows individual
contribution — the brief asks for this explicitly.

---

## Known gaps (say these out loud before you're asked)

- Sessions are a signed cookie, not a session table. Fine for a checkpoint,
  being replaced before final submission.
- `recipe_embeddings` is empty — the table, the index and the retrieval SQL
  all exist; only the model call is stubbed. `/api/recommend` falls back to
  PostgreSQL full-text search so the feature still works end to end today.
- Only 8 recipes. Enough to show the mechanism; the real dataset lands next.
