#!/usr/bin/env node
/**
 * Vector CRUD walkthrough on real embeddings, for the demo and the report.
 *
 *   npm run db:vector-demo            run all four steps, then clean up
 *   npm run db:vector-demo -- --keep  leave the demo recipe in place
 *
 * Uses a throwaway recipe, "Roasted Tomato Garlic Soup", so the seeded
 * data is unchanged afterwards.
 *
 *   CREATE  insert recipe + ingredients, embed, sp_upsert_recipe_embedding
 *   READ    nearest neighbours of the stored vector, and a typed query
 *   UPDATE  edit the description -> trigger deletes the stale vector ->
 *           re-embed -> compare old and new vectors
 *   DELETE  remove the vector, then the recipe (FK cascade)
 */
import { connect } from './db-client.mjs'; // loads .env.local first
import { embed, toVectorLiteral, EMBEDDING_MODEL_NAME } from '../src/lib/embedder.mjs';

const keep = process.argv.includes('--keep');
const TITLE = 'Roasted Tomato Garlic Soup';
const client = await connect();

const step = (title) => console.log(`\n${'='.repeat(70)}\n${title}\n${'='.repeat(70)}`);
const sql = (text) => console.log(`\nSQL> ${text.trim().replace(/\s+/g, ' ')}`);
const show = (rows) => console.table(rows);

async function embedRecipe(recipeId) {
  const { rows: [src] } = await client.query(
    'SELECT source_text FROM v_recipe_embedding_source WHERE recipe_id = $1',
    [recipeId]
  );
  const vector = await embed(src.source_text);
  const text = 'CALL sp_upsert_recipe_embedding($1, $2::vector, $3, $4)';
  sql(text);
  await client.query(text, [recipeId, toVectorLiteral(vector), src.source_text, EMBEDDING_MODEL_NAME]);
  return vector;
}

try {
  // Clean up any leftover from an earlier --keep run.
  await client.query('DELETE FROM recipes WHERE title = $1', [TITLE]);

  // ------------------------------------------------------------- CREATE
  step('1. CREATE - add a recipe and store its embedding');
  await client.query('BEGIN');
  const { rows: [created] } = await client.query(
    `INSERT INTO recipes (created_by, title, description, instructions, cuisine_type,
                          prep_time_minutes, calories, protein_g, carbs_g, fat_g)
     VALUES (1, $1,
             'Velvety soup of oven-roasted tomatoes, onion and garlic finished with butter. Warming and vegetarian.',
             'Roast tomatoes, onion and garlic until soft. Blend with water, simmer, then stir in butter and salt.',
             'continental', 40, 260, 5, 24, 16)
     RETURNING recipe_id`,
    [TITLE]
  );
  const id = created.recipe_id;
  await client.query(
    `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
     SELECT $1, ingredient_id, q, u
       FROM (VALUES ('tomato', 400, 'g'), ('onion', 60, 'g'), ('garlic', 10, 'g'),
                    ('butter', 15, 'g'), ('salt', 3, 'g')) v(name, q, u)
       JOIN ingredients USING (name)`,
    [id]
  );
  await client.query('COMMIT');
  console.log(`Inserted recipe ${id} with 5 ingredients.`);

  const firstVector = await embedRecipe(id);
  sql(`SELECT recipe_id, model_name, vector_dims(embedding), vector_norm(embedding), ... FROM recipe_embeddings WHERE recipe_id = ${id}`);
  show(
    (
      await client.query(
        `SELECT recipe_id, model_name,
                vector_dims(embedding)                AS dims,
                ROUND(vector_norm(embedding)::numeric, 4) AS norm,
                LEFT(embedding::text, 60) || '...'    AS first_values,
                LEFT(source_text, 50) || '...'        AS source_text
           FROM recipe_embeddings WHERE recipe_id = $1`,
        [id]
      )
    ).rows
  );

  // --------------------------------------------------------------- READ
  step('2. READ - similarity search');
  const neighbours = `
    SELECT r.title, ROUND((1 - (e.embedding <=> q.embedding))::numeric, 4) AS similarity
      FROM recipe_embeddings e
      JOIN recipes r ON r.recipe_id = e.recipe_id
     CROSS JOIN (SELECT embedding FROM recipe_embeddings WHERE recipe_id = $1) q
     WHERE e.recipe_id <> $1
     ORDER BY e.embedding <=> q.embedding
     LIMIT 3`;
  sql(neighbours);
  console.log('(recipes most similar in meaning to the new soup)');
  show((await client.query(neighbours, [id])).rows);

  const typed = 'warm soup for a cold evening';
  sql(`SELECT title, similarity FROM fn_semantic_search(embed('${typed}'), 3)`);
  const typedVector = toVectorLiteral(await embed(typed));
  show(
    (await client.query('SELECT title, similarity FROM fn_semantic_search($1::vector, 3)', [typedVector]))
      .rows
  );

  // ------------------------------------------------------------- UPDATE
  step('3. UPDATE - change the text, the trigger invalidates the vector');
  const upd = `UPDATE recipes SET description = 'Spicy roasted tomato soup with chilli and garlic, served chilled in summer.' WHERE recipe_id = ${id}`;
  sql(upd);
  await client.query(
    `UPDATE recipes
        SET description = 'Spicy roasted tomato soup with chilli and garlic, served chilled in summer.'
      WHERE recipe_id = $1`,
    [id]
  );
  sql(`SELECT has_embedding FROM v_recipe_embedding_source WHERE recipe_id = ${id}`);
  show(
    (
      await client.query(
        'SELECT recipe_id, has_embedding FROM v_recipe_embedding_source WHERE recipe_id = $1',
        [id]
      )
    ).rows
  );
  console.log('trg_invalidate_embedding deleted the stale vector. Re-embedding:');

  await embedRecipe(id);
  const compare = `SELECT 1 - (embedding <=> $old) AS similarity_to_old_vector FROM recipe_embeddings WHERE recipe_id = ${id}`;
  sql(compare);
  show(
    (
      await client.query(
        `SELECT recipe_id,
                ROUND((1 - (embedding <=> $2::vector))::numeric, 4) AS similarity_to_old_vector,
                embedded_at
           FROM recipe_embeddings WHERE recipe_id = $1`,
        [id, toVectorLiteral(firstVector)]
      )
    ).rows
  );
  console.log('Below 1.0: the stored vector now reflects the new description.');

  // ------------------------------------------------------------- DELETE
  step('4. DELETE - remove the vector, then the recipe');
  const delVec = `DELETE FROM recipe_embeddings WHERE recipe_id = ${id}`;
  sql(delVec);
  const { rowCount: vecRows } = await client.query(
    'DELETE FROM recipe_embeddings WHERE recipe_id = $1',
    [id]
  );
  console.log(`${vecRows} vector deleted.`);

  if (keep) {
    await embedRecipe(id);
    console.log(`\n--keep: recipe ${id} kept with a fresh embedding.`);
  } else {
    const delRecipe = `DELETE FROM recipes WHERE recipe_id = ${id}`;
    sql(delRecipe);
    await client.query('DELETE FROM recipes WHERE recipe_id = $1', [id]);
    console.log('Recipe deleted; its recipe_ingredients rows went with it (ON DELETE CASCADE).');
  }

  sql('SELECT COUNT(*) FROM recipes; SELECT COUNT(*) FROM recipe_embeddings;');
  show(
    (
      await client.query(
        `SELECT (SELECT COUNT(*) FROM recipes)           AS recipes,
                (SELECT COUNT(*) FROM recipe_embeddings) AS embeddings`
      )
    ).rows
  );
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\nVector demo failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
