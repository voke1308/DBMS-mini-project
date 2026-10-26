/**
 * Stage 2 of the recommender — semantic re-ranking.
 *
 * CHECKPOINT 1 STATUS: not wired up yet. `embed()` returns null unless
 * EMBEDDING_API_URL is configured, and every caller falls back to
 * PostgreSQL full-text search so the app still works end to end.
 *
 * Plan for checkpoint 2:
 *   - model      : all-MiniLM-L6-v2 (384 dimensions, runs locally, free)
 *   - source text: recipe title + description + cuisine_type
 *   - storage    : recipe_embeddings.embedding, type vector(384)
 *   - metric     : cosine distance, the `<=>` operator from pgvector
 *   - index      : ivfflat (see db/02_indexes.sql)
 */

export const EMBEDDING_DIMS = 384;

/** Turn text into a vector. Returns null when no service is configured. */
export async function embed(text) {
  const url = process.env.EMBEDDING_API_URL;
  if (!url) return null;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model: process.env.EMBEDDING_MODEL }),
  });
  if (!res.ok) throw new Error(`Embedding service returned ${res.status}`);

  const { embedding } = await res.json();
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMS) {
    throw new Error(`Expected a ${EMBEDDING_DIMS}-dimension vector`);
  }
  return embedding;
}

/** Format a JS array as a pgvector literal, e.g. '[0.1,0.2,...]'. */
export function toVectorLiteral(values) {
  return `[${values.join(',')}]`;
}
