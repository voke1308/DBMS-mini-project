-- =====================================================================
--  06_seed.sql  :  demo data
--  All three accounts below use the password: password123
--  (bcrypt cost 10 — the plain text is never stored anywhere.)
-- =====================================================================

BEGIN;

-- ---- USERS ----------------------------------------------------------
INSERT INTO users (name, email, password_hash, role) VALUES
 ('Admin',        'admin@nutripantry.dev', '$2a$10$gSQYh05EKxoO2/VZ08qSTOOWf1ClKyY8GpWbo4WIHZNjCm8KbrOhi', 'admin'),
 ('Krishna',      'krishna@example.com',   '$2a$10$gSQYh05EKxoO2/VZ08qSTOOWf1ClKyY8GpWbo4WIHZNjCm8KbrOhi', 'user'),
 ('Teammate',     'teammate@example.com',  '$2a$10$gSQYh05EKxoO2/VZ08qSTOOWf1ClKyY8GpWbo4WIHZNjCm8KbrOhi', 'user');


-- ---- INGREDIENTS ----------------------------------------------------
INSERT INTO ingredients (name, category, default_unit, is_staple) VALUES
 ('rice',           'grain',     'g',  TRUE),
 ('wheat flour',    'grain',     'g',  TRUE),
 ('pasta',          'grain',     'g',  FALSE),
 ('oats',           'grain',     'g',  FALSE),
 ('chicken breast', 'protein',   'g',  FALSE),
 ('eggs',           'protein',   'pcs',TRUE),
 ('paneer',         'protein',   'g',  FALSE),
 ('chickpeas',      'protein',   'g',  FALSE),
 ('lentils',        'protein',   'g',  TRUE),
 ('milk',           'dairy',     'ml', TRUE),
 ('yogurt',         'dairy',     'g',  FALSE),
 ('cheese',         'dairy',     'g',  FALSE),
 ('butter',         'dairy',     'g',  TRUE),
 ('tomato',         'vegetable', 'g',  TRUE),
 ('onion',          'vegetable', 'g',  TRUE),
 ('garlic',         'vegetable', 'g',  TRUE),
 ('spinach',        'vegetable', 'g',  FALSE),
 ('bell pepper',    'vegetable', 'g',  FALSE),
 ('potato',         'vegetable', 'g',  TRUE),
 ('banana',         'fruit',     'pcs',FALSE),
 ('lemon',          'fruit',     'pcs',FALSE),
 ('olive oil',      'oil',       'ml', TRUE),
 ('cumin',          'spice',     'g',  TRUE),
 ('turmeric',       'spice',     'g',  TRUE),
 ('chilli powder',  'spice',     'g',  TRUE),
 ('salt',           'spice',     'g',  TRUE);


-- ---- RECIPES (authored by the admin) --------------------------------
INSERT INTO recipes
 (created_by, title, description, instructions, cuisine_type,
  prep_time_minutes, calories, protein_g, carbs_g, fat_g)
VALUES
 (1, 'Masala Omelette',
     'A quick, spicy high-protein breakfast with onion, tomato and green chilli.',
     'Beat the eggs with salt and spices. Fold in chopped onion and tomato. Cook in a hot pan with a little oil until set.',
     'indian', 10, 310.00, 20.00, 6.00, 22.00),

 (1, 'Garlic Butter Chicken',
     'Juicy pan-seared chicken breast in a rich garlic butter sauce. Low carb and filling.',
     'Season the chicken. Sear in butter until golden. Add minced garlic and finish with a squeeze of lemon.',
     'continental', 25, 480.00, 45.00, 4.00, 30.00),

 (1, 'Creamy Tomato Pasta',
     'Comforting, mildly spiced tomato pasta finished with cheese. Vegetarian.',
     'Boil the pasta. Simmer tomato, onion and garlic into a sauce. Stir in milk and cheese, then toss with the pasta.',
     'italian', 30, 620.00, 18.00, 85.00, 22.00),

 (1, 'Spinach Paneer Scramble',
     'Soft paneer scrambled with spinach and cumin — light, vegetarian and quick.',
     'Saute cumin and onion. Add spinach until wilted. Crumble in paneer and season.',
     'indian', 20, 390.00, 24.00, 12.00, 27.00),

 (1, 'Lemon Herb Chickpea Salad',
     'A refreshing cold salad: chickpeas, tomato, onion and a bright lemon dressing.',
     'Rinse the chickpeas. Toss with chopped vegetables, olive oil, lemon juice and salt.',
     'mediterranean', 15, 340.00, 15.00, 44.00, 12.00),

 (1, 'Overnight Oats with Banana',
     'No-cook breakfast. Oats soaked in milk and yogurt, topped with banana.',
     'Combine oats, milk and yogurt. Refrigerate overnight. Top with sliced banana before eating.',
     'continental', 5, 350.00, 14.00, 58.00, 8.00),

 (1, 'Dal Tadka',
     'Everyday comfort lentils tempered with cumin, garlic and chilli.',
     'Boil the lentils with turmeric. Temper cumin, garlic and chilli in oil and pour over the dal.',
     'indian', 35, 290.00, 16.00, 42.00, 6.00),

 (1, 'Crispy Potato Hash',
     'Golden, crispy potato cubes with onion and bell pepper. Hearty and vegetarian.',
     'Parboil and cube the potatoes. Fry with onion and bell pepper until crisp and browned.',
     'continental', 25, 420.00, 8.00, 62.00, 16.00);


-- ---- RECIPE_INGREDIENTS (weak entity) -------------------------------
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) VALUES
 -- 1 Masala Omelette
 (1,  6, 3,   'pcs'), (1, 15, 40, 'g'), (1, 14, 40, 'g'),
 (1, 25, 2,   'g'),   (1, 26, 3,  'g'), (1, 22, 10, 'ml'),
 -- 2 Garlic Butter Chicken
 (2,  5, 250, 'g'),   (2, 13, 20, 'g'), (2, 16, 10, 'g'),
 (2, 21, 1,   'pcs'), (2, 26, 3,  'g'),
 -- 3 Creamy Tomato Pasta
 (3,  3, 150, 'g'),   (3, 14, 120,'g'), (3, 15, 50, 'g'),
 (3, 16, 8,   'g'),   (3, 10, 100,'ml'),(3, 12, 40, 'g'), (3, 26, 3, 'g'),
 -- 4 Spinach Paneer Scramble
 (4,  7, 180, 'g'),   (4, 17, 100,'g'), (4, 15, 40, 'g'),
 (4, 23, 2,   'g'),   (4, 22, 10, 'ml'),(4, 26, 3, 'g'),
 -- 5 Lemon Herb Chickpea Salad
 (5,  8, 200, 'g'),   (5, 14, 80, 'g'), (5, 15, 40, 'g'),
 (5, 21, 1,   'pcs'), (5, 22, 15, 'ml'),(5, 26, 3, 'g'),
 -- 6 Overnight Oats with Banana
 (6,  4, 60,  'g'),   (6, 10, 150,'ml'),(6, 11, 80, 'g'), (6, 20, 1, 'pcs'),
 -- 7 Dal Tadka
 (7,  9, 150, 'g'),   (7, 16, 8,  'g'), (7, 23, 2,  'g'),
 (7, 24, 2,   'g'),   (7, 25, 2,  'g'), (7, 22, 10, 'ml'), (7, 26, 3, 'g'),
 -- 8 Crispy Potato Hash
 (8, 19, 300, 'g'),   (8, 15, 50, 'g'), (8, 18, 80, 'g'),
 (8, 22, 20, 'ml'),   (8, 26, 3,  'g');


-- ---- NUTRITION GOALS ------------------------------------------------
INSERT INTO nutrition_goals (user_id, daily_calories, protein_g, carbs_g, fat_g) VALUES
 (2, 2200, 140, 220, 70),
 (3, 1800, 110, 180, 55);


-- ---- PANTRY ITEMS ---------------------------------------------------
-- Krishna's pantry: enough for the omelette and the dal.
INSERT INTO pantry_items (user_id, ingredient_id, quantity, unit, expiry_date) VALUES
 (2,  6, 6,   'pcs', CURRENT_DATE + 12),
 (2, 15, 300, 'g',   CURRENT_DATE + 20),
 (2, 14, 250, 'g',   CURRENT_DATE + 5),
 (2, 25, 50,  'g',   NULL),
 (2, 26, 500, 'g',   NULL),
 (2, 22, 400, 'ml',  CURRENT_DATE + 180),
 (2,  9, 500, 'g',   CURRENT_DATE + 150),
 (2, 16, 60,  'g',   CURRENT_DATE + 2),
 (2, 23, 40,  'g',   NULL),
 (2, 24, 40,  'g',   NULL),
 (2,  1, 1000,'g',   CURRENT_DATE + 200);

-- Teammate's pantry: leans towards the pasta and the oats.
INSERT INTO pantry_items (user_id, ingredient_id, quantity, unit, expiry_date) VALUES
 (3,  3, 400, 'g',   CURRENT_DATE + 90),
 (3, 14, 200, 'g',   CURRENT_DATE + 4),
 (3, 15, 150, 'g',   CURRENT_DATE + 20),
 (3, 16, 30,  'g',   CURRENT_DATE + 15),
 (3, 10, 1000,'ml',  CURRENT_DATE + 3),
 (3, 12, 150, 'g',   CURRENT_DATE + 25),
 (3,  4, 500, 'g',   CURRENT_DATE + 120),
 (3, 11, 400, 'g',   CURRENT_DATE + 6),
 (3, 20, 4,   'pcs', CURRENT_DATE + 3),
 (3, 26, 500, 'g',   NULL);


-- ---- SAVED RECIPES (weak entity) ------------------------------------
INSERT INTO saved_recipes (user_id, recipe_id) VALUES
 (2, 1), (2, 7), (3, 3), (3, 6);


-- ---- SEARCH LOG -----------------------------------------------------
INSERT INTO search_log (user_id, query_text, recipe_id, rank_score) VALUES
 (2, 'something quick and high protein', 1, 0.8750),
 (2, 'comfort food with lentils',        7, 0.8120),
 (3, 'creamy and cheesy, not too spicy', 3, 0.9010),
 (3, 'no-cook breakfast',                6, 0.8640),
 (3, 'seafood curry',                 NULL, NULL);

COMMIT;
