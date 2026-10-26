-- =====================================================================
--  05_triggers.sql  :  triggers (advanced feature)
--  These enforce rules at the DATABASE level, so they hold even if the
--  application layer is bypassed (requirement 12: data integrity).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Reject pantry items that are already expired, and normalise units.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trgfn_validate_pantry_item()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.expiry_date IS NOT NULL AND NEW.expiry_date < CURRENT_DATE THEN
        RAISE EXCEPTION
            'Cannot add "%" — expiry date % is already in the past',
            (SELECT name FROM ingredients WHERE ingredient_id = NEW.ingredient_id),
            NEW.expiry_date;
    END IF;

    NEW.unit := lower(trim(NEW.unit));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_pantry_item ON pantry_items;
CREATE TRIGGER trg_validate_pantry_item
    BEFORE INSERT OR UPDATE ON pantry_items
    FOR EACH ROW EXECUTE FUNCTION trgfn_validate_pantry_item();


-- ---------------------------------------------------------------------
-- 2. Only one active nutrition goal per user — setting a new one
--    automatically retires the previous one.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trgfn_single_active_goal()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.is_active THEN
        UPDATE nutrition_goals
        SET    is_active = FALSE,
               end_date  = COALESCE(end_date, CURRENT_DATE)
        WHERE  user_id   = NEW.user_id
          AND  is_active = TRUE
          AND  goal_id  <> NEW.goal_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_active_goal ON nutrition_goals;
CREATE TRIGGER trg_single_active_goal
    AFTER INSERT ON nutrition_goals
    FOR EACH ROW EXECUTE FUNCTION trgfn_single_active_goal();


-- ---------------------------------------------------------------------
-- 3. Invalidate a recipe's embedding when its text changes, so the
--    embedding job knows to regenerate it. Keeps SQL and the vector
--    store from drifting apart.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trgfn_invalidate_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.title       IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.cuisine_type IS DISTINCT FROM OLD.cuisine_type THEN
        DELETE FROM recipe_embeddings WHERE recipe_id = NEW.recipe_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_embedding ON recipes;
CREATE TRIGGER trg_invalidate_embedding
    AFTER UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION trgfn_invalidate_embedding();
