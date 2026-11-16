-- Run as the database setup user on the seeded demo database.
-- All changes are rolled back at the end of the demonstration.
BEGIN;
SET LOCAL ROLE nutripantry_member;
SELECT set_config('nutripantry.user_id', '2', true);

-- This deliberately omits a user_id filter. PostgreSQL still returns only user 2.
SELECT current_user AS db_role, array_agg(DISTINCT user_id) AS visible_owners
FROM v_user_pantry;

DO $demo$
DECLARE
    demo_ingredient integer;
    affected integer;
BEGIN
    IF EXISTS (SELECT 1 FROM v_user_pantry WHERE user_id <> 2)
       OR EXISTS (SELECT 1 FROM nutrition_goals WHERE user_id <> 2) THEN
        RAISE EXCEPTION 'Cross-account read was visible';
    END IF;
    UPDATE pantry_items SET quantity = 99 WHERE user_id = 3;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Cross-account update succeeded'; END IF;

    SELECT ingredient_id INTO STRICT demo_ingredient FROM ingredients WHERE name = 'chickpeas';
    DELETE FROM pantry_items WHERE user_id = 2 AND ingredient_id = demo_ingredient;
    CALL sp_upsert_pantry_item(2, demo_ingredient, 2, 'g', CURRENT_DATE + 5);
    CALL sp_upsert_pantry_item(2, demo_ingredient, 3, 'g', NULL);
    IF (SELECT quantity FROM pantry_items WHERE ingredient_id = demo_ingredient) IS DISTINCT FROM 5
       OR (SELECT expiry_date FROM pantry_items WHERE ingredient_id = demo_ingredient) IS DISTINCT FROM CURRENT_DATE + 5 THEN
        RAISE EXCEPTION 'Top-up failed to add stock or keep the expiry date';
    END IF;

    BEGIN
        UPDATE pantry_items SET expiry_date = CURRENT_DATE - 1 WHERE ingredient_id = demo_ingredient;
        RAISE EXCEPTION 'Expired date was accepted' USING ERRCODE = 'XX000';
    EXCEPTION WHEN raise_exception THEN
        RAISE NOTICE 'Past expiry rejected by pantry trigger';
    END;

    UPDATE pantry_items SET quantity = 7, expiry_date = NULL WHERE ingredient_id = demo_ingredient;
    IF NOT EXISTS (SELECT 1 FROM v_user_pantry
                    WHERE ingredient_id = demo_ingredient AND quantity = 7 AND freshness = 'no_expiry') THEN
        RAISE EXCEPTION 'Pantry edit did not apply';
    END IF;
    DELETE FROM pantry_items WHERE ingredient_id = demo_ingredient;
    IF FOUND IS FALSE THEN RAISE EXCEPTION 'Pantry delete did not apply'; END IF;

    BEGIN
        INSERT INTO nutrition_goals (user_id, daily_calories) VALUES (3, 1950);
        RAISE EXCEPTION 'Cross-account goal insertion succeeded';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Cross-account goal insertion blocked by row-level security';
    END;

    INSERT INTO nutrition_goals (user_id, daily_calories, protein_g, carbs_g, fat_g)
    VALUES (2, 1950, 100, 230, 60);
    IF (SELECT count(*) FROM nutrition_goals WHERE is_active) <> 1
       OR fn_active_goal_calories(2) IS DISTINCT FROM 1950 THEN
        RAISE EXCEPTION 'Goal trigger did not leave exactly one active goal';
    END IF;

    BEGIN
        PERFORM 1 FROM v_admin_popular_ingredients;
        RAISE EXCEPTION 'Member unexpectedly accessed the admin report';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Member denied access to the admin report';
    END;
    RAISE NOTICE 'Pantry CRUD, account isolation, and goal replacement passed';
END
$demo$;

SET LOCAL ROLE NONE;
SET LOCAL ROLE nutripantry_admin_report;
SELECT current_user AS db_role, count(*) AS report_rows FROM v_admin_popular_ingredients;

DO $demo$
BEGIN
    BEGIN
        UPDATE pantry_items SET quantity = 0;
        RAISE EXCEPTION 'Reporting role unexpectedly modified pantry rows';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Reporting role denied direct pantry writes';
    END;
END
$demo$;

ROLLBACK;
