-- =====================================================================
--  db/demo/recipe_queries.sql — recipe & recommendation queries for the
--  demo and the report. Read-only: safe to run any number of times.
--
--  Not run by `npm run db:setup` (it only reads db/*.sql).
--  Run after setup and `npm run db:embed`:
--
--    docker exec -i nutripantry-db psql -U nutripantry -d nutripantry < db/demo/recipe_queries.sql
--
--  User 2 is the seeded account krishna@example.com.
-- =====================================================================
\pset pager off
\pset null '(null)'


\echo '\n--- Q1. JOIN (4 tables): recipes Krishna can fully cook right now ---'
-- A recipe qualifies when none of its ingredients is missing from the
-- pantry: NOT EXISTS with a nested correlated subquery.
SELECT  r.recipe_id, r.title, r.calories, r.prep_time_minutes
FROM    recipes r
WHERE   NOT EXISTS (
          SELECT 1
          FROM   recipe_ingredients ri
          WHERE  ri.recipe_id = r.recipe_id
            AND  NOT EXISTS (
                   SELECT 1 FROM pantry_items p
                   WHERE  p.user_id = 2
                     AND  p.ingredient_id = ri.ingredient_id
                     AND  p.quantity > 0))
ORDER BY r.prep_time_minutes;


\echo '\n--- Q2. JOIN + GROUP BY + HAVING + aggregates: ingredients used by 5+ recipes ---'
SELECT  i.name,
        i.category,
        COUNT(ri.recipe_id)                          AS used_in_recipes,
        ROUND(AVG(r.calories), 0)                    AS avg_recipe_calories,
        LEFT(string_agg(r.title, ', ' ORDER BY r.title), 60) AS recipes
FROM        ingredients        i
JOIN        recipe_ingredients ri ON ri.ingredient_id = i.ingredient_id
JOIN        recipes            r  ON r.recipe_id      = ri.recipe_id
GROUP BY    i.ingredient_id
HAVING      COUNT(ri.recipe_id) >= 5
ORDER BY    used_in_recipes DESC, i.name;


\echo '\n--- Q3. Aggregation per cuisine with FILTER ---'
SELECT  cuisine_type,
        COUNT(*)                                        AS recipes,
        ROUND(AVG(calories), 0)                         AS avg_kcal,
        ROUND(AVG(protein_g), 1)                        AS avg_protein_g,
        COUNT(*) FILTER (WHERE prep_time_minutes <= 20) AS quick_recipes,
        MIN(prep_time_minutes)                          AS fastest_min
FROM    recipes
WHERE   is_published
GROUP BY cuisine_type
ORDER BY recipes DESC, cuisine_type;


\echo '\n--- Q4. Correlated subquery: recipes above the average protein of their own cuisine ---'
SELECT  r.title, r.cuisine_type, r.protein_g,
        (SELECT ROUND(AVG(x.protein_g), 1)
           FROM recipes x
          WHERE x.cuisine_type = r.cuisine_type)       AS cuisine_avg_protein
FROM    recipes r
WHERE   r.protein_g > (SELECT AVG(x.protein_g)
                         FROM recipes x
                        WHERE x.cuisine_type = r.cuisine_type)
ORDER BY r.cuisine_type, r.protein_g DESC;


\echo '\n--- Q5. Correlated subquery in SELECT: what each recipe is still missing for Krishna ---'
SELECT  title, needs, needs - have AS missing_count, missing
FROM (
    SELECT  r.title,
            (SELECT COUNT(*) FROM recipe_ingredients ri
              WHERE ri.recipe_id = r.recipe_id)                  AS needs,
            (SELECT COUNT(*) FROM recipe_ingredients ri
              WHERE ri.recipe_id = r.recipe_id
                AND ri.ingredient_id IN (SELECT ingredient_id
                                           FROM pantry_items
                                          WHERE user_id = 2 AND quantity > 0)) AS have,
            (SELECT string_agg(i.name, ', ' ORDER BY i.name)
               FROM recipe_ingredients ri
               JOIN ingredients i ON i.ingredient_id = ri.ingredient_id
              WHERE ri.recipe_id = r.recipe_id
                AND ri.ingredient_id NOT IN (SELECT ingredient_id
                                               FROM pantry_items
                                              WHERE user_id = 2 AND quantity > 0)) AS missing
    FROM    recipes r
) t
ORDER BY missing_count, title
LIMIT 8;


\echo '\n--- Q6. Ranking function (stage 1): fn_recommend_recipes(2, 5) ---'
SELECT * FROM fn_recommend_recipes(2, 5);


\echo '\n--- Q7. CTE + window functions: best recipe per cuisine for Krishna ---'
WITH goal AS (
    SELECT COALESCE(fn_active_goal_calories(2), 2000) / 3.0 AS meal_kcal
),
scored AS (
    SELECT  r.title,
            r.cuisine_type,
            r.calories,
            COALESCE(m.match_ratio, 0)                  AS pantry,
            fn_nutrition_fit(r.calories, g.meal_kcal)   AS goal_fit
    FROM        recipes r
    CROSS JOIN  goal g
    LEFT JOIN   v_pantry_match m ON m.recipe_id = r.recipe_id AND m.user_id = 2
),
ranked AS (
    SELECT  *,
            ROUND(0.6 * pantry + 0.4 * goal_fit, 4)  AS score,
            RANK() OVER (PARTITION BY cuisine_type
                         ORDER BY 0.6 * pantry + 0.4 * goal_fit DESC) AS rank_in_cuisine
    FROM    scored
)
SELECT  cuisine_type, title, calories, ROUND(pantry, 2) AS pantry,
        ROUND(goal_fit, 2) AS goal_fit, score
FROM    ranked
WHERE   rank_in_cuisine = 1
ORDER BY score DESC;


\echo '\n--- Q8. Recursive CTE: recipes reachable from "Masala Omelette" through shared ingredients ---'
-- Two recipes are linked when they share at least 3 ingredients.
-- Depth 1 = direct neighbour, depth 2 = neighbour of a neighbour.
WITH RECURSIVE
links AS (
    SELECT  a.recipe_id AS from_id, b.recipe_id AS to_id
    FROM    recipe_ingredients a
    JOIN    recipe_ingredients b ON b.ingredient_id = a.ingredient_id
                                AND b.recipe_id    <> a.recipe_id
    GROUP BY a.recipe_id, b.recipe_id
    HAVING  COUNT(*) >= 3
),
walk (recipe_id, depth, path) AS (
    SELECT  recipe_id, 0, ARRAY[recipe_id]
    FROM    recipes WHERE title = 'Masala Omelette'
  UNION ALL
    SELECT  l.to_id, w.depth + 1, w.path || l.to_id
    FROM    walk  w
    JOIN    links l ON l.from_id = w.recipe_id
    WHERE   w.depth < 2
      AND   NOT l.to_id = ANY (w.path)          -- no cycles
)
SELECT  r.title, MIN(w.depth) AS hops
FROM    walk w JOIN recipes r ON r.recipe_id = w.recipe_id
GROUP BY r.title
ORDER BY hops, r.title;


\echo '\n--- Q9. Full-text search (GIN index) for comparison with vector search ---'
SELECT  title,
        ROUND(ts_rank(search_tsv, websearch_to_tsquery('english', 'spicy curry'))::numeric, 4) AS rank
FROM    recipes
WHERE   search_tsv @@ websearch_to_tsquery('english', 'spicy curry')
ORDER BY rank DESC;
\echo 'No recipe contains both words, so keyword search finds nothing.'
\echo 'Vector search matches meaning instead: npm run db:search -- "spicy curry"'


\echo '\n--- Q10. Vector READ: embedding status for every recipe ---'
SELECT  recipe_id, title, has_embedding, is_stale
FROM    v_recipe_embedding_source
ORDER BY recipe_id;


\echo '\n--- Q11. Vector similarity: "more like Chana Masala" (k-NN, cosine) ---'
SELECT  r.title,
        ROUND((e.embedding <=> q.embedding)::numeric, 4)       AS cosine_distance,
        ROUND((1 - (e.embedding <=> q.embedding))::numeric, 4) AS similarity
FROM        recipe_embeddings e
JOIN        recipes r ON r.recipe_id = e.recipe_id
CROSS JOIN  (SELECT e2.embedding
               FROM recipe_embeddings e2 JOIN recipes r2 USING (recipe_id)
              WHERE r2.title = 'Chana Masala') q
WHERE       r.title <> 'Chana Masala'
ORDER BY    e.embedding <=> q.embedding
LIMIT 5;


\echo '\n--- Q12. Index check: the k-NN query plan uses the HNSW index ---'
SET enable_seqscan = off;   -- the table is tiny; force the planner to show the index path
EXPLAIN (COSTS OFF)
SELECT recipe_id
FROM   recipe_embeddings
ORDER BY embedding <=> (SELECT embedding FROM recipe_embeddings WHERE recipe_id = 15)
LIMIT 5;
RESET enable_seqscan;

-- Typed natural-language queries need the model to embed the text first:
--   npm run db:search -- "warm comforting vegetarian curry"
-- which calls fn_semantic_search and fn_hybrid_search with that vector.
