import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { embed, toVectorLiteral } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/recommend?q=something+spicy&limit=10
 *
 * Stage 1  — fn_recommend_recipes(): pantry overlap + calorie fit, in SQL.
 * Stage 2  — if `q` is given, re-rank with pgvector cosine distance when an
 *            embedding service is configured, otherwise fall back to
 *            PostgreSQL full-text search over the generated tsvector.
 * Finally, the query is written to search_log in the same transaction.
 */
export async function GET(request) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const limit = Math.min(Number(searchParams.get('limit') || 10), 50);

  try {
    // ---- stage 1: structured ranking --------------------------------
    let rows = await query('SELECT * FROM fn_recommend_recipes($1, $2)', [
      user.userId,
      limit,
    ]);
    let mode = 'sql';

    // ---- stage 2: semantic / text re-ranking ------------------------
    if (q && rows.length > 0) {
      const ids = rows.map((r) => r.recipe_id);
      const vector = await embed(q);

      if (vector) {
        mode = 'vector';
        const ranked = await query(
          `SELECT r.recipe_id,
                  1 - (e.embedding <=> $2::vector) AS similarity
             FROM recipes r
             JOIN recipe_embeddings e ON e.recipe_id = r.recipe_id
            WHERE r.recipe_id = ANY($1::int[])
            ORDER BY e.embedding <=> $2::vector`,
          [ids, toVectorLiteral(vector)]
        );
        rows = mergeScores(rows, ranked, 'similarity');
      } else {
        mode = 'fulltext';
        const ranked = await query(
          `SELECT recipe_id,
                  ts_rank(search_tsv, websearch_to_tsquery('english', $2)) AS similarity
             FROM recipes
            WHERE recipe_id = ANY($1::int[])
            ORDER BY similarity DESC`,
          [ids, q]
        );
        rows = mergeScores(rows, ranked, 'similarity');
      }
    }

    // ---- log the query (transaction) --------------------------------
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO search_log (user_id, query_text, recipe_id, rank_score)
         VALUES ($1, $2, $3, $4)`,
        [user.userId, q || '(no query)', rows[0]?.recipe_id ?? null, rows[0]?.score ?? null]
      );
    });

    return NextResponse.json({ mode, count: rows.length, results: rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Blend the SQL score with the semantic similarity, 70/30. */
function mergeScores(base, ranked, key) {
  const sim = new Map(ranked.map((r) => [r.recipe_id, Number(r[key]) || 0]));
  return base
    .map((r) => {
      const similarity = sim.get(r.recipe_id) ?? 0;
      return {
        ...r,
        similarity: Number(similarity.toFixed(4)),
        score: Number((0.7 * Number(r.score) + 0.3 * similarity).toFixed(4)),
      };
    })
    .sort((a, b) => b.score - a.score);
}
