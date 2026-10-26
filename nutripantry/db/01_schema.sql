-- =====================================================================
--  NutriPantry — Goal-Based Recipe Recommendation System
--  01_schema.sql  :  DDL — tables, keys, constraints
--  Target        :  PostgreSQL 16 + pgvector
--  Run order     :  01 -> 02 -> 03 -> 04 -> 05 -> 06
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- Dropped in reverse dependency order so the script is re-runnable.
DROP TABLE IF EXISTS search_log         CASCADE;
DROP TABLE IF EXISTS saved_recipes      CASCADE;
DROP TABLE IF EXISTS recipe_embeddings  CASCADE;
DROP TABLE IF EXISTS recipe_ingredients CASCADE;
DROP TABLE IF EXISTS pantry_items       CASCADE;
DROP TABLE IF EXISTS nutrition_goals    CASCADE;
DROP TABLE IF EXISTS recipes            CASCADE;
DROP TABLE IF EXISTS ingredients        CASCADE;
DROP TABLE IF EXISTS users              CASCADE;


-- ---------------------------------------------------------------------
-- USERS  (strong entity)
-- Two roles satisfy the role-based access requirement.
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id        SERIAL        PRIMARY KEY,
    name           VARCHAR(100)  NOT NULL,
    email          VARCHAR(255)  NOT NULL,
    password_hash  VARCHAR(255)  NOT NULL,
    role           VARCHAR(10)   NOT NULL DEFAULT 'user',
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_users_email  UNIQUE (email),
    CONSTRAINT chk_users_role  CHECK (role IN ('user', 'admin')),
    CONSTRAINT chk_users_email CHECK (email LIKE '%_@_%._%')
);


-- ---------------------------------------------------------------------
-- INGREDIENTS  (strong entity) — master list, shared by pantries+recipes
-- ---------------------------------------------------------------------
CREATE TABLE ingredients (
    ingredient_id  SERIAL       PRIMARY KEY,
    name           VARCHAR(100) NOT NULL,
    category       VARCHAR(50)  NOT NULL DEFAULT 'other',
    default_unit   VARCHAR(20)  NOT NULL DEFAULT 'g',

    CONSTRAINT uq_ingredients_name UNIQUE (name),
    CONSTRAINT chk_ing_category CHECK (category IN
        ('vegetable','fruit','grain','protein','dairy','spice','oil','other'))
);


-- ---------------------------------------------------------------------
-- RECIPES  (strong entity)
-- created_by is the admin who authored it (self-referencing role on USERS)
-- ---------------------------------------------------------------------
CREATE TABLE recipes (
    recipe_id          SERIAL       PRIMARY KEY,
    created_by         INTEGER,
    title              VARCHAR(200) NOT NULL,
    description        TEXT         NOT NULL DEFAULT '',
    instructions       TEXT         NOT NULL DEFAULT '',
    cuisine_type       VARCHAR(50)  NOT NULL DEFAULT 'other',
    prep_time_minutes  SMALLINT     NOT NULL DEFAULT 30,
    calories           NUMERIC(7,2) NOT NULL DEFAULT 0,
    protein_g          NUMERIC(6,2) NOT NULL DEFAULT 0,
    carbs_g            NUMERIC(6,2) NOT NULL DEFAULT 0,
    fat_g              NUMERIC(6,2) NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_recipes_author FOREIGN KEY (created_by)
        REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT chk_recipes_prep CHECK (prep_time_minutes BETWEEN 1 AND 600),
    CONSTRAINT chk_recipes_macros CHECK (
        calories >= 0 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0)
);


-- ---------------------------------------------------------------------
-- NUTRITION_GOALS  (dependent entity, surrogate key, owned by USERS)
-- ---------------------------------------------------------------------
CREATE TABLE nutrition_goals (
    goal_id         SERIAL       PRIMARY KEY,
    user_id         INTEGER      NOT NULL,
    daily_calories  NUMERIC(7,2) NOT NULL,
    protein_g       NUMERIC(6,2) NOT NULL DEFAULT 0,
    carbs_g         NUMERIC(6,2) NOT NULL DEFAULT 0,
    fat_g           NUMERIC(6,2) NOT NULL DEFAULT 0,
    start_date      DATE         NOT NULL DEFAULT CURRENT_DATE,
    end_date        DATE,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_goals_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT chk_goals_calories CHECK (daily_calories BETWEEN 500 AND 6000),
    CONSTRAINT chk_goals_dates    CHECK (end_date IS NULL OR end_date >= start_date)
);


-- ---------------------------------------------------------------------
-- PANTRY_ITEMS  (dependent entity) — what a user currently has at home
-- ---------------------------------------------------------------------
CREATE TABLE pantry_items (
    pantry_item_id  SERIAL        PRIMARY KEY,
    user_id         INTEGER       NOT NULL,
    ingredient_id   INTEGER       NOT NULL,
    quantity        NUMERIC(10,2) NOT NULL DEFAULT 0,
    unit            VARCHAR(20)   NOT NULL DEFAULT 'g',
    expiry_date     DATE,
    added_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_pantry_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_pantry_ingredient FOREIGN KEY (ingredient_id)
        REFERENCES ingredients (ingredient_id) ON DELETE RESTRICT,
    CONSTRAINT uq_pantry_user_ingredient UNIQUE (user_id, ingredient_id),
    CONSTRAINT chk_pantry_qty CHECK (quantity >= 0)
);


-- ---------------------------------------------------------------------
-- RECIPE_INGREDIENTS  (WEAK entity — PK is composed of both owners' PKs)
-- Resolves the many-to-many between RECIPES and INGREDIENTS.
-- ---------------------------------------------------------------------
CREATE TABLE recipe_ingredients (
    recipe_id      INTEGER       NOT NULL,
    ingredient_id  INTEGER       NOT NULL,
    quantity       NUMERIC(10,2) NOT NULL DEFAULT 0,
    unit           VARCHAR(20)   NOT NULL DEFAULT 'g',

    CONSTRAINT pk_recipe_ingredients PRIMARY KEY (recipe_id, ingredient_id),
    CONSTRAINT fk_ri_recipe FOREIGN KEY (recipe_id)
        REFERENCES recipes (recipe_id) ON DELETE CASCADE,
    CONSTRAINT fk_ri_ingredient FOREIGN KEY (ingredient_id)
        REFERENCES ingredients (ingredient_id) ON DELETE RESTRICT,
    CONSTRAINT chk_ri_qty CHECK (quantity >= 0)
);


-- ---------------------------------------------------------------------
-- SAVED_RECIPES  (WEAK entity) — many-to-many USERS <-> RECIPES
-- ---------------------------------------------------------------------
CREATE TABLE saved_recipes (
    user_id    INTEGER     NOT NULL,
    recipe_id  INTEGER     NOT NULL,
    saved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_saved_recipes PRIMARY KEY (user_id, recipe_id),
    CONSTRAINT fk_saved_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_saved_recipe FOREIGN KEY (recipe_id)
        REFERENCES recipes (recipe_id) ON DELETE CASCADE
);


-- ---------------------------------------------------------------------
-- RECIPE_EMBEDDINGS  (vector paradigm)
-- 384 dimensions = all-MiniLM-L6-v2 sentence-transformer output size.
-- Kept in its own table so the relational model stays clean.
-- ---------------------------------------------------------------------
CREATE TABLE recipe_embeddings (
    recipe_id    INTEGER     PRIMARY KEY,
    embedding    vector(384) NOT NULL,
    source_text  TEXT        NOT NULL,
    model_name   VARCHAR(80) NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    embedded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_emb_recipe FOREIGN KEY (recipe_id)
        REFERENCES recipes (recipe_id) ON DELETE CASCADE
);


-- ---------------------------------------------------------------------
-- SEARCH_LOG  (dependent entity) — every recommendation query
-- recipe_id is nullable: a query may return no match.
-- ---------------------------------------------------------------------
CREATE TABLE search_log (
    log_id       SERIAL       PRIMARY KEY,
    user_id      INTEGER      NOT NULL,
    query_text   TEXT         NOT NULL,
    recipe_id    INTEGER,
    rank_score   NUMERIC(6,4),
    searched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_log_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_log_recipe FOREIGN KEY (recipe_id)
        REFERENCES recipes (recipe_id) ON DELETE SET NULL,
    CONSTRAINT chk_log_score CHECK (rank_score IS NULL OR rank_score >= 0)
);


-- ---------------------------------------------------------------------
-- ALTER demo (requirement 5 asks for CREATE / ALTER / DROP)
-- ---------------------------------------------------------------------
ALTER TABLE recipes
    ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE ingredients
    ADD COLUMN IF NOT EXISTS is_staple BOOLEAN NOT NULL DEFAULT FALSE;
