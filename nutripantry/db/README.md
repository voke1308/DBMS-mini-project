# Database layer

Run the files in numeric order. `npm run db:setup` does this for you, then
`npm run db:embed` stores the recipe vectors.

| File | Contents |
|---|---|
| `01_schema.sql` | `CREATE EXTENSION vector`, 9 tables, primary keys, foreign keys, `UNIQUE` and `CHECK` constraints, two `ALTER TABLE` statements |
| `02_indexes.sql` | B-tree indexes, one composite **partial** index, a generated `tsvector` column with a **GIN** index, and an **HNSW** cosine index for pgvector |
| `03_views.sql` | `v_recipe_overview`, `v_user_pantry`, `v_pantry_match`, `v_admin_popular_ingredients` |
| `04_functions.sql` | `fn_nutrition_fit`, `fn_active_goal_calories`, `fn_recommend_recipes`, and the transactional procedure `sp_upsert_pantry_item` |
| `05_triggers.sql` | Pantry validation, single-active-goal enforcement, embedding invalidation (recipe text and recipe ingredients) |
| `06_seed.sql` | Demo users, 26 ingredients, 16 recipes, pantries, goals, saved recipes, search log |
| `07_search.sql` | `v_recipe_embedding_source`, `sp_upsert_recipe_embedding`, `fn_semantic_search`, and the CTE-based `fn_hybrid_search` |
| `demo/recipe_queries.sql` | Read-only demo queries (joins, HAVING, correlated and nested subqueries, CTE, recursive CTE, vector k-NN, index plan). **Not** run by setup |

## Tables

| Table | Kind | Primary key |
|---|---|---|
| `users` | strong | `user_id` |
| `ingredients` | strong | `ingredient_id` |
| `recipes` | strong | `recipe_id` |
| `nutrition_goals` | dependent | `goal_id` |
| `pantry_items` | dependent | `pantry_item_id` |
| `search_log` | dependent | `log_id` |
| `recipe_ingredients` | **weak** | `(recipe_id, ingredient_id)` |
| `saved_recipes` | **weak** | `(user_id, recipe_id)` |
| `recipe_embeddings` | vector side-table | `recipe_id` |

## Vector data model

- **What is embedded** — one text per recipe, built by the view
  `v_recipe_embedding_source`: title, description, cuisine and the
  ingredient names (`string_agg ... ORDER BY name`)
- **Model** — `sentence-transformers/all-MiniLM-L6-v2`, 384 dimensions, run
  locally in Node with Transformers.js (`src/lib/embedder.mjs`); mean pooling,
  L2-normalised. No API key; the model (about 90 MB) downloads on first use
- **Storage** — `recipe_embeddings.embedding` of type `vector(384)`, one row per
  recipe, plus `source_text`, `model_name` and `embedded_at` as metadata
- **Metric** — cosine distance, the `<=>` operator; similarity = 1 − distance
- **Index** — `hnsw (embedding vector_cosine_ops)`. HNSW instead of IVFFlat
  because IVFFlat is trained on the rows present at build time (none here) and,
  with few rows, `probes = 1` silently drops results
- **Keeping vectors in sync** — triggers delete a recipe's vector when its
  title, description, cuisine or ingredients change; `is_stale` in
  `v_recipe_embedding_source` also flags any mismatch. `npm run db:embed`
  re-embeds only missing or stale rows
- **Retrieval**
  - `fn_semantic_search(query, k)` — pure k-NN: `ORDER BY embedding <=> query LIMIT k`
  - `fn_hybrid_search(user, query, k)` — CTE chain: cosine similarity →
    min-max rescaled *relevance* → joined with pantry overlap and calorie fit →
    `score = 0.7·relevance + 0.2·pantry + 0.1·goal_fit` → `RANK()`
  - With no typed query the app uses `fn_recommend_recipes` (pantry 60% + goal 40%)

## Vector commands

| Command | What it does |
|---|---|
| `npm run db:embed` | Embed recipes that are missing or stale (`-- --all` rebuilds every one) |
| `npm run db:search -- "warm vegetarian curry"` | Prints vector-only and hybrid results for a typed query (`--user 3`, `--limit 5`) |
| `npm run db:vector-demo` | Full vector CRUD on a throwaway recipe: create, k-NN read, update + re-embed, delete |

## Useful queries for the demo

```sql
-- the recommender, straight from psql
SELECT * FROM fn_recommend_recipes(2, 5);

-- a trigger rejecting bad data at the database level
INSERT INTO pantry_items (user_id, ingredient_id, quantity, unit, expiry_date)
VALUES (2, 14, 100, 'g', CURRENT_DATE - 5);

-- full-text search over the generated tsvector
-- (websearch_to_tsquery is more forgiving than plainto_tsquery, which
--  ANDs every term and so returns nothing if one word fails to stem)
SELECT title, ts_rank(search_tsv, websearch_to_tsquery('english', 'creamy pasta')) AS rank
FROM   recipes
WHERE  search_tsv @@ websearch_to_tsquery('english', 'creamy pasta')
ORDER  BY rank DESC;

-- subquery + aggregate: users whose pantry beats the average size
SELECT u.name, COUNT(p.pantry_item_id) AS items
FROM   users u JOIN pantry_items p ON p.user_id = u.user_id
GROUP  BY u.user_id
HAVING COUNT(p.pantry_item_id) > (
         SELECT AVG(c) FROM (SELECT COUNT(*) AS c FROM pantry_items GROUP BY user_id) t
       );
```
