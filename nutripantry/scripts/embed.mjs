#!/usr/bin/env node
/**
 * CHECKPOINT 2 — generates an embedding for every recipe that does not
 * yet have one and writes it into recipe_embeddings.
 *
 *   npm run db:embed
 *
 * Right now it only reports what WOULD be embedded, so the pipeline is
 * visible and testable before the model is plugged in.
 */
import pg from 'pg';

const client = new pg.Client(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
      }
);

await client.connect();

// The trigger trg_invalidate_embedding deletes a row here whenever a
// recipe's text changes, so this query also picks up edited recipes.
const { rows } = await client.query(`
  SELECT r.recipe_id,
         r.title || '. ' || r.description || ' Cuisine: ' || r.cuisine_type AS source_text
  FROM   recipes r
  LEFT   JOIN recipe_embeddings e ON e.recipe_id = r.recipe_id
  WHERE  e.recipe_id IS NULL
  ORDER  BY r.recipe_id
`);

console.log(`${rows.length} recipe(s) need an embedding:\n`);
for (const r of rows) {
  console.log(`  [${r.recipe_id}] ${r.source_text.slice(0, 72)}…`);
}

console.log(`
Next step (checkpoint 2):
  1. pip install sentence-transformers  (or run a small local embed API)
  2. encode source_text with all-MiniLM-L6-v2  -> 384 floats
  3. INSERT INTO recipe_embeddings (recipe_id, embedding, source_text)
     VALUES ($1, $2::vector, $3)
  4. REINDEX idx_embeddings_cosine once all rows are in
`);

await client.end();
