-- =====================================================================
--  04_functions.sql  :  stored functions + procedures (advanced feature)
-- =====================================================================

-- ---------------------------------------------------------------------
-- fn_nutrition_fit — how well a recipe's calories fit a target.
-- Returns 1.0 for a perfect match, decaying to 0.0 as it drifts away.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_nutrition_fit(
    p_recipe_calories NUMERIC,
    p_target_calories NUMERIC
) RETURNS NUMERIC
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_target_calories IS NULL OR p_target_calories <= 0 THEN
        RETURN 0.5;                       -- no goal set: stay neutral
    END IF;

    RETURN GREATEST(
        0,
        1 - (ABS(p_recipe_calories - p_target_calories) / p_target_calories)
    );
END;
$$;


-- ---------------------------------------------------------------------
-- fn_active_goal_calories — the user's current daily calorie target.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_active_goal_calories(p_user_id INTEGER)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_calories NUMERIC;
BEGIN
    SELECT daily_calories INTO v_calories
    FROM   nutrition_goals
    WHERE  user_id = p_user_id
      AND  is_active = TRUE
      AND  (end_date IS NULL OR end_date >= CURRENT_DATE)
    ORDER BY start_date DESC
    LIMIT 1;

    RETURN v_calories;                    -- NULL when the user set no goal
END;
$$;


-- ---------------------------------------------------------------------
-- fn_recommend_recipes — STAGE 1 of the two-stage recommender.
--
-- Pure SQL: rank recipes by how much of the recipe the user already owns
-- and how closely it fits their calorie goal. Stage 2 (semantic re-rank
-- with pgvector) runs on top of this result set in the application.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recommend_recipes(
    p_user_id INTEGER,
    p_limit   INTEGER DEFAULT 10
)
RETURNS TABLE (
    recipe_id           INTEGER,
    title               VARCHAR(200),
    calories            NUMERIC(7,2),
    prep_time_minutes   SMALLINT,
    matched_ingredients BIGINT,
    total_ingredients   BIGINT,
    match_ratio         NUMERIC,
    nutrition_fit       NUMERIC,
    score               NUMERIC
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_daily  NUMERIC := fn_active_goal_calories(p_user_id);
    v_target NUMERIC;
BEGIN
    -- one meal is treated as a third of the daily budget
    v_target := COALESCE(v_daily, 2000) / 3.0;

    RETURN QUERY
    SELECT  r.recipe_id,
            r.title,
            r.calories,
            r.prep_time_minutes,
            m.matched_ingredients,
            m.total_ingredients,
            m.match_ratio,
            ROUND(fn_nutrition_fit(r.calories, v_target), 4)          AS nutrition_fit,
            ROUND(
                0.6 * m.match_ratio
              + 0.4 * fn_nutrition_fit(r.calories, v_target)
            , 4)                                                       AS score
    FROM        recipes        r
    JOIN        v_pantry_match m ON m.recipe_id = r.recipe_id
                                AND m.user_id   = p_user_id
    WHERE       r.is_published = TRUE
    ORDER BY    score DESC, m.match_ratio DESC, r.prep_time_minutes ASC
    LIMIT       p_limit;
END;
$$;


-- ---------------------------------------------------------------------
-- sp_upsert_pantry_item — add or top up a pantry item inside a
-- transaction, so a partial write can never be left behind.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_upsert_pantry_item(
    p_user_id       INTEGER,
    p_ingredient_id INTEGER,
    p_quantity      NUMERIC,
    p_unit          VARCHAR(20),
    p_expiry        DATE DEFAULT NULL
)
LANGUAGE plpgsql AS $$
BEGIN
    IF p_quantity < 0 THEN
        RAISE EXCEPTION 'Quantity cannot be negative (got %)', p_quantity;
    END IF;

    INSERT INTO pantry_items (user_id, ingredient_id, quantity, unit, expiry_date)
    VALUES (p_user_id, p_ingredient_id, p_quantity, p_unit, p_expiry)
    ON CONFLICT (user_id, ingredient_id) DO UPDATE
        SET quantity    = pantry_items.quantity + EXCLUDED.quantity,
            unit        = EXCLUDED.unit,
            expiry_date = COALESCE(EXCLUDED.expiry_date, pantry_items.expiry_date);

EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE EXCEPTION 'Unknown user or ingredient';
END;
$$;
