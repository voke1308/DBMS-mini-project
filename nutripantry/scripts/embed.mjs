#!/usr/bin/env node
/**
 * Generates recipe embeddings and stores them in recipe_embeddings.
 *
 *   npm run db:embed            embed recipes that are missing or stale
 *   npm run db:embed -- --all   re-embed every recipe
 *
 * Source text comes from the view v_recipe_embedding_source (title,
 * description, cuisine and ingredient names). Each vector is written
 * with the procedure sp_upsert_recipe_embedding, all inside one
 * transaction: either every embedding is saved or none is.
 *
 * The triggers trg_invalidate_embedding and
 * trg_invalidate_embedding_on_ingredients delete a recipe's vector when
 * its text or ingredients change, so a plain run picks those up again.
 */
import { connect } from './db-client.mjs'; // loads .env.local first
import {
  embedMany,
  toVectorLiteral,
  EMBEDDING_MODEL_NAME,
  EMBEDDING_DIMS,
} from '../src/lib/embedder.mjs';

const all = process.argv.includes('--all');
const client = await connect();

try {
  const { rows } = await client.query(
    `SELECT recipe_id, title, source_text, has_embedding, is_stale
       FROM v_recipe_embedding_source
      WHERE $1 OR NOT has_embedding OR is_stale
      ORDER BY recipe_id`,
    [all]
  );

  if (rows.length === 0) {
    console.log('Every recipe already has an up-to-date embedding. Use --all to rebuild.');
  } else {
    console.log(`Embedding ${rows.length} recipe(s) with ${EMBEDDING_MODEL_NAME} (${EMBEDDING_DIMS} dims)...`);
    console.log('(the first run downloads the model, about 90 MB)\n');

    const started = Date.now();
    const vectors = await embedMany(rows.map((r) => r.source_text));

    await client.query('BEGIN');
    for (let i = 0; i < rows.length; i++) {
      await client.query('CALL sp_upsert_recipe_embedding($1, $2::vector, $3, $4)', [
        rows[i].recipe_id,
        toVectorLiteral(vectors[i]),
        rows[i].source_text,
        EMBEDDING_MODEL_NAME,
      ]);
      const why = !rows[i].has_embedding ? 'new' : rows[i].is_stale ? 'stale' : 'rebuilt';
      console.log(`  [${String(rows[i].recipe_id).padStart(2)}] ${rows[i].title.padEnd(28)} ${why}`);
    }
    await client.query('COMMIT');
    console.log(`\nSaved ${rows.length} embedding(s) in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  }

  const [summary] = (
    await client.query(`
      SELECT COUNT(*)                                   AS recipes,
             COUNT(*) FILTER (WHERE has_embedding)      AS embedded,
             COUNT(*) FILTER (WHERE is_stale)           AS stale
        FROM v_recipe_embedding_source`)
  ).rows;
  console.log(`Status: ${summary.embedded}/${summary.recipes} recipes embedded, ${summary.stale} stale.`);
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\nEmbedding failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
