-- Apply after the base schema and seed. Safe to run on an existing demo database.
BEGIN;

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nutripantry_member') THEN
        CREATE ROLE nutripantry_member NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nutripantry_admin_report') THEN
        CREATE ROLE nutripantry_admin_report NOLOGIN;
    END IF;
END
$roles$;

GRANT nutripantry_member, nutripantry_admin_report TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO nutripantry_member, nutripantry_admin_report;

GRANT SELECT ON ingredients, v_user_pantry TO nutripantry_member;
GRANT SELECT, INSERT, UPDATE, DELETE ON pantry_items TO nutripantry_member;
GRANT SELECT, INSERT, UPDATE ON nutrition_goals TO nutripantry_member;
GRANT USAGE ON SEQUENCE pantry_items_pantry_item_id_seq,
    nutrition_goals_goal_id_seq TO nutripantry_member;
REVOKE EXECUTE ON PROCEDURE sp_upsert_pantry_item(integer, integer, numeric, varchar, date)
    FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE sp_upsert_pantry_item(integer, integer, numeric, varchar, date)
    TO nutripantry_member;

GRANT SELECT ON v_admin_popular_ingredients, v_recipe_overview
    TO nutripantry_admin_report;

-- Evaluate pantry view queries using the caller's grants and row policies.
ALTER VIEW v_user_pantry SET (security_invoker = true);
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pantry_owner ON pantry_items;
CREATE POLICY pantry_owner ON pantry_items TO nutripantry_member
    USING (user_id = NULLIF(current_setting('nutripantry.user_id', true), '')::integer)
    WITH CHECK (user_id = NULLIF(current_setting('nutripantry.user_id', true), '')::integer);

DROP POLICY IF EXISTS goal_owner ON nutrition_goals;
CREATE POLICY goal_owner ON nutrition_goals TO nutripantry_member
    USING (user_id = NULLIF(current_setting('nutripantry.user_id', true), '')::integer)
    WITH CHECK (user_id = NULLIF(current_setting('nutripantry.user_id', true), '')::integer);

COMMIT;
