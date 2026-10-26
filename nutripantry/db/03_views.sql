-- =====================================================================
--  03_views.sql  :  views (advanced feature)
-- =====================================================================

-- ---------------------------------------------------------------------
-- v_recipe_overview — one row per recipe with its ingredient count.
-- Demonstrates JOIN + GROUP BY + aggregate functions.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_recipe_overview AS
SELECT  r.recipe_id,
        r.title,
        r.cuisine_type,
        r.prep_time_minutes,
        r.calories,
        r.protein_g,
        r.carbs_g,
        r.fat_g,
        u.name                      AS author,
        COUNT(ri.ingredient_id)     AS ingredient_count,
        r.is_published
FROM        recipes            r
LEFT JOIN   users              u  ON u.user_id  = r.created_by
LEFT JOIN   recipe_ingredients ri ON ri.recipe_id = r.recipe_id
GROUP BY    r.recipe_id, u.name;


-- ---------------------------------------------------------------------
-- v_user_pantry — a readable pantry listing with expiry status.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_pantry AS
SELECT  p.pantry_item_id,
        p.user_id,
        i.ingredient_id,
        i.name          AS ingredient_name,
        i.category,
        p.quantity,
        p.unit,
        p.expiry_date,
        CASE
            WHEN p.expiry_date IS NULL                       THEN 'no_expiry'
            WHEN p.expiry_date <  CURRENT_DATE               THEN 'expired'
            WHEN p.expiry_date <= CURRENT_DATE + INTERVAL '3 day' THEN 'expiring_soon'
            ELSE 'fresh'
        END             AS freshness
FROM      pantry_items p
JOIN      ingredients  i ON i.ingredient_id = p.ingredient_id;


-- ---------------------------------------------------------------------
-- v_pantry_match — the heart of stage 1 of the recommender.
-- For every (user, recipe) pair: how many of the recipe's ingredients
-- the user already owns, and what fraction that is.
-- Demonstrates JOIN + GROUP BY + HAVING + aggregates.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pantry_match AS
SELECT  p.user_id,
        ri.recipe_id,
        COUNT(*)                                        AS matched_ingredients,
        (SELECT COUNT(*) FROM recipe_ingredients x
          WHERE x.recipe_id = ri.recipe_id)             AS total_ingredients,
        ROUND(
            COUNT(*)::numeric
            / NULLIF((SELECT COUNT(*) FROM recipe_ingredients x
                       WHERE x.recipe_id = ri.recipe_id), 0)
        , 4)                                            AS match_ratio
FROM      recipe_ingredients ri
JOIN      pantry_items       p  ON p.ingredient_id = ri.ingredient_id
                               AND p.quantity > 0
GROUP BY  p.user_id, ri.recipe_id
HAVING    COUNT(*) > 0;


-- ---------------------------------------------------------------------
-- v_admin_popular_ingredients — admin dashboard feed.
-- Which ingredients appear in the most pantries right now.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_admin_popular_ingredients AS
SELECT  i.ingredient_id,
        i.name,
        i.category,
        COUNT(DISTINCT p.user_id) AS pantry_count,
        COUNT(DISTINCT ri.recipe_id) AS recipe_count
FROM        ingredients        i
LEFT JOIN   pantry_items       p  ON p.ingredient_id  = i.ingredient_id
LEFT JOIN   recipe_ingredients ri ON ri.ingredient_id = i.ingredient_id
GROUP BY    i.ingredient_id
ORDER BY    pantry_count DESC, recipe_count DESC;
