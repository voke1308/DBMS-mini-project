# Database layer

Run the files in numeric order. `npm run db:setup` does this for you.

| File | Contents |
|---|---|
| `01_schema.sql` | `CREATE EXTENSION vector`, 9 tables, primary keys, foreign keys, `UNIQUE` and `CHECK` constraints, two `ALTER TABLE` statements |
| `02_indexes.sql` | B-tree indexes, one composite **partial** index, a generated `tsvector` column with a **GIN** index, and an **ivfflat** cosine index for pgvector |
| `03_views.sql` | `v_recipe_overview`, `v_user_pantry`, `v_pantry_match`, `v_admin_popular_ingredients` |
| `04_functions.sql` | `fn_nutrition_fit`, `fn_active_goal_calories`, `fn_recommend_recipes`, and the transactional procedure `sp_upsert_pantry_item` |
| `05_triggers.sql` | Pantry validation, single-active-goal enforcement, embedding invalidation |
| `06_seed.sql` | Demo users, 26 ingredients, 8 recipes, pantries, goals, saved recipes, search log |

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

- **What is embedded** — `title + description + cuisine_type` per recipe
- **Model** — `all-MiniLM-L6-v2`, 384 dimensions
- **Storage** — `recipe_embeddings.embedding` of type `vector(384)`
- **Metric** — cosine distance, the `<=>` operator
- **Index** — `ivfflat (embedding vector_cosine_ops)`
- **Retrieval** — stage 1 narrows candidates in SQL, stage 2 re-ranks that
  candidate set by cosine distance and blends the two scores 70/30

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
