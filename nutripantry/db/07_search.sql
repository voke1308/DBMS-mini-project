-- =====================================================================
--  07_search.sql  :  recipe search — vector storage helpers and the
--                    hybrid (SQL + pgvector) ranking
--
--  Owner: recipe search and recommendations
--  Depends on 01-05 (tables, views, fn_nutrition_fit,
--  fn_active_goal_calories).
-- =====================================================================


-- ---------------------------------------------------------------------
-- v_recipe_embedding_source — the exact text that gets embedded for
-- each recipe, built in SQL so the app, the embed script and the report
-- all use one definition.
--
--   "<title>. <description> Cuisine: <cuisine>. Ingredients: a, b, c."
--
-- Ingredient names are included so a query such as "something with
-- chickpeas" can match on meaning. Demonstrates LEFT JOIN, GROUP BY and
-- the ordered aggregate string_agg(... ORDER BY ...).
--
-- has_embedding / is_stale show which rows the embed job must (re)build:
-- stale means the stored source_text no longer matches the recipe.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_recipe_embedding_source AS
WITH src AS (
    SELECT  r.recipe_id,
            r.title,
            r.title || '. ' || r.description
                || ' Cuisine: ' || r.cuisine_type || '.'
                || COALESCE(' Ingredients: '
                            || string_agg(i.name, ', ' ORDER BY i.name) || '.', '')
                                                AS source_text
    FROM        recipes            r
    LEFT JOIN   recipe_ingredients ri ON ri.recipe_id    = r.recipe_id
    LEFT JOIN   ingredients        i  ON i.ingredient_id = ri.ingredient_id
    GROUP BY    r.recipe_id
)
SELECT  s.recipe_id,
        s.title,
        s.source_text,
        (e.recipe_id IS NOT NULL)                       AS has_embedding,
        (e.recipe_id IS NOT NULL
         AND e.source_text IS DISTINCT FROM s.source_text) AS is_stale
FROM        src               s
LEFT JOIN   recipe_embeddings e ON e.recipe_id = s.recipe_id;


-- ---------------------------------------------------------------------
-- sp_upsert_recipe_embedding — vector CREATE / UPDATE in one call.
-- Inserts the embedding, or replaces it if the recipe already has one.
-- The dimension is checked by the vector(384) column type itself.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_upsert_recipe_embedding(
    p_recipe_id   INTEGER,
    p_embedding   vector(384),
    p_source_text TEXT,
    p_model_name  VARCHAR(80) DEFAULT 'all-MiniLM-L6-v2'
)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO recipe_embeddings (recipe_id, embedding, source_text, model_name)
    VALUES (p_recipe_id, p_embedding, p_source_text, p_model_name)
    ON CONFLICT (recipe_id) DO UPDATE
        SET embedding   = EXCLUDED.embedding,
            source_text = EXCLUDED.source_text,
            model_name  = EXCLUDED.model_name,
            embedded_at = NOW();
EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE EXCEPTION 'Recipe % does not exist', p_recipe_id;
END;
$$;


-- ---------------------------------------------------------------------
-- fn_semantic_search — pure vector retrieval (k-nearest neighbours).
--
-- Cosine distance d = embedding <=> query lies in [0, 2];
-- similarity = 1 - d, so 1.0 means "same meaning".
-- ORDER BY distance + LIMIT is the shape the HNSW index accelerates.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_semantic_search(
    p_query vector(384),
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    recipe_id     INTEGER,
    title         VARCHAR(200),
    cuisine_type  VARCHAR(50),
    calories      NUMERIC(7,2),
    distance      NUMERIC,
    similarity    NUMERIC
)
LANGUAGE sql STABLE AS $$
    SELECT  r.recipe_id,
            r.title,
            r.cuisine_type,
            r.calories,
            ROUND((e.embedding <=> p_query)::numeric, 4)      AS distance,
            ROUND((1 - (e.embedding <=> p_query))::numeric, 4) AS similarity
    FROM    recipe_embeddings e
    JOIN    recipes           r ON r.recipe_id = e.recipe_id
    WHERE   r.is_published = TRUE
    ORDER BY e.embedding <=> p_query
    LIMIT   p_limit;
$$;


-- ---------------------------------------------------------------------
-- fn_hybrid_search — the natural-language recommender.
--
-- One query, written as a chain of CTEs, that combines three signals:
--
--   relevance  how close the recipe's meaning is to what the user typed.
--              Raw cosine similarity from all-MiniLM-L6-v2 sits in a
--              narrow band (roughly 0.2-0.6 for short queries), so it is
--              min-max scaled across the catalogue: best match = 1,
--              weakest = 0. Otherwise pantry overlap (0-1) would swamp it.
--   pantry     share of the recipe's ingredients the user already owns
--              (v_pantry_match; 0 when they own none of them)
--   goal_fit   how well the calories fit one meal of the active goal
--              (fn_nutrition_fit; a meal = a third of the daily target)
--
--   score = w_relevance * relevance + w_pantry * pantry + w_goal * goal_fit
--
-- Defaults 0.7 / 0.2 / 0.1: what the user asked for leads; between two
-- similarly relevant recipes, the one they can cook now and that fits
-- their goal ranks higher. Unlike fn_recommend_recipes, a recipe needs no
-- pantry overlap to appear. RANK() numbers the final order.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_hybrid_search(
    p_user_id      INTEGER,
    p_query        vector(384),
    p_limit        INTEGER DEFAULT 10,
    p_w_relevance  NUMERIC DEFAULT 0.7,
    p_w_pantry     NUMERIC DEFAULT 0.2,
    p_w_goal       NUMERIC DEFAULT 0.1
)
RETURNS TABLE (
    rank                INTEGER,
    recipe_id           INTEGER,
    title               VARCHAR(200),
    cuisine_type        VARCHAR(50),
    calories            NUMERIC(7,2),
    prep_time_minutes   SMALLINT,
    matched_ingredients BIGINT,
    total_ingredients   BIGINT,
    similarity          NUMERIC,
    relevance           NUMERIC,
    pantry              NUMERIC,
    goal_fit            NUMERIC,
    score               NUMERIC
)
LANGUAGE sql STABLE AS $$
    WITH
    -- 1. calorie budget for one meal (2000 kcal/day if no active goal)
    meal_target AS (
        SELECT COALESCE(fn_active_goal_calories(p_user_id), 2000) / 3.0 AS kcal
    ),
    -- 2. meaning: cosine similarity of every embedded recipe to the query
    semantic AS (
        SELECT  e.recipe_id,
                (1 - (e.embedding <=> p_query))::numeric AS similarity
        FROM    recipe_embeddings e
    ),
    -- 3. rescale similarity to 0..1 across the catalogue (window functions)
    relevance AS (
        SELECT  s.recipe_id,
                s.similarity,
                COALESCE(
                    (s.similarity - MIN(s.similarity) OVER ())
                    / NULLIF(MAX(s.similarity) OVER () - MIN(s.similarity) OVER (), 0),
                    1)                                    AS relevance
        FROM    semantic s
    ),
    -- 4. pantry overlap for this user only
    pantry AS (
        SELECT  m.recipe_id, m.matched_ingredients, m.match_ratio
        FROM    v_pantry_match m
        WHERE   m.user_id = p_user_id
    ),
    -- 5. join the signals onto every published recipe
    scored AS (
        SELECT  r.recipe_id,
                r.title,
                r.cuisine_type,
                r.calories,
                r.prep_time_minutes,
                COALESCE(p.matched_ingredients, 0)             AS matched_ingredients,
                (SELECT COUNT(*) FROM recipe_ingredients x      -- correlated
                  WHERE x.recipe_id = r.recipe_id)             AS total_ingredients,
                COALESCE(v.similarity, 0)                      AS similarity,
                COALESCE(v.relevance,  0)                      AS relevance,
                COALESCE(p.match_ratio, 0)                     AS pantry,
                fn_nutrition_fit(r.calories, t.kcal)           AS goal_fit
        FROM        recipes     r
        CROSS JOIN  meal_target t
        LEFT JOIN   relevance   v ON v.recipe_id = r.recipe_id
        LEFT JOIN   pantry      p ON p.recipe_id = r.recipe_id
        WHERE       r.is_published = TRUE
    ),
    -- 6. weighted score
    ranked AS (
        SELECT  sc.*,
                p_w_relevance * sc.relevance
              + p_w_pantry    * sc.pantry
              + p_w_goal      * sc.goal_fit                    AS score
        FROM    scored sc
    )
    SELECT  RANK() OVER (ORDER BY rk.score DESC)::INTEGER       AS rank,
            rk.recipe_id,
            rk.title,
            rk.cuisine_type,
            rk.calories,
            rk.prep_time_minutes,
            rk.matched_ingredients,
            rk.total_ingredients,
            ROUND(rk.similarity, 4),
            ROUND(rk.relevance,  4),
            ROUND(rk.pantry,     4),
            ROUND(rk.goal_fit,   4),
            ROUND(rk.score,      4)
    FROM    ranked rk
    ORDER BY rk.score DESC, rk.prep_time_minutes ASC
    LIMIT   p_limit;
$$;
