-- =====================================================================
--  02_indexes.sql  :  indexing + full-text search support
-- =====================================================================

-- ---- B-tree indexes on frequently filtered / joined columns ----------
CREATE INDEX IF NOT EXISTS idx_pantry_user        ON pantry_items (user_id);
CREATE INDEX IF NOT EXISTS idx_pantry_ingredient  ON pantry_items (ingredient_id);
CREATE INDEX IF NOT EXISTS idx_pantry_expiry      ON pantry_items (expiry_date);

CREATE INDEX IF NOT EXISTS idx_ri_ingredient      ON recipe_ingredients (ingredient_id);

CREATE INDEX IF NOT EXISTS idx_goals_user_active  ON nutrition_goals (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_log_user_time      ON search_log (user_id, searched_at DESC);

-- Composite + partial index: the recommender only ever scans published
-- recipes inside a calorie window, so the filter is baked into the index.
CREATE INDEX IF NOT EXISTS idx_recipes_calories_published
    ON recipes (calories, prep_time_minutes)
    WHERE is_published = TRUE;


-- ---- Full-text search (advanced feature) -----------------------------
-- A stored generated column keeps the tsvector in sync automatically.
ALTER TABLE recipes
    ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')),       'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(cuisine_type, '')),'C')
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_recipes_fts ON recipes USING GIN (search_tsv);


-- ---- Vector similarity index (advanced feature) ----------------------
-- Cosine distance (<=>) matches how sentence-transformer vectors are
-- normally compared. Rebuild with more lists once the corpus grows.
CREATE INDEX IF NOT EXISTS idx_embeddings_cosine
    ON recipe_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10);
