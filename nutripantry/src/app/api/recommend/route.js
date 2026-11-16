import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { embed, toVectorLiteral } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';

const MODES = new Set(['hybrid', 'semantic']);

/**
 * GET /api/recommend                          stage 1 only (SQL ranking)
 * GET /api/recommend?q=spicy+dinner           hybrid search
 * GET /api/recommend?q=...&mode=semantic      vector similarity only
 *     optional &limit=1..50 (default 10)
 *
 * No query  -> fn_recommend_recipes(): pantry overlap + calorie fit.
 * With a query, the text is embedded with all-MiniLM-L6-v2 and passed to
 *   hybrid    fn_hybrid_search(): 0.7 relevance + 0.2 pantry + 0.1 goal fit
 *   semantic  fn_semantic_search(): pure cosine k-NN over recipe_embeddings
 * If the model cannot load (e.g. first run offline), it falls back to
 * PostgreSQL full-text search over the generated tsvector.
 * Every request is written to search_log inside a transaction.
 */
export async function GET(request) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().slice(0, 300);
  const requested = searchParams.get('mode') || 'hybrid';
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 10, 1), 50);

  if (!MODES.has(requested)) {
    return NextResponse.json({ error: 'mode must be hybrid or semantic' }, { status: 400 });
  }

  try {
    let mode;
    let rows;
    let topScore = null;
    let notice = null;

    if (!q) {
      // ---- stage 1 only: structured ranking in SQL ------------------
      mode = 'sql';
      rows = await query('SELECT * FROM fn_recommend_recipes($1, $2)', [user.userId, limit]);
      topScore = rows[0]?.score;
    } else {
      let vector = null;
      try {
        vector = toVectorLiteral(await embed(q));
      } catch (err) {
        notice = `Embedding model unavailable (${err.message}); used keyword search instead.`;
      }

      if (vector && requested === 'semantic') {
        mode = 'semantic';
        rows = await query('SELECT * FROM fn_semantic_search($1::vector, $2)', [vector, limit]);
        topScore = rows[0]?.similarity;
      } else if (vector) {
        mode = 'hybrid';
        rows = await query('SELECT * FROM fn_hybrid_search($1, $2::vector, $3)', [
          user.userId,
          vector,
          limit,
        ]);
        topScore = rows[0]?.score;
      } else {
        mode = 'fulltext';
        rows = await query(
          `SELECT recipe_id, title, cuisine_type, calories,
                  ROUND(ts_rank(search_tsv, websearch_to_tsquery('english', $1))::numeric, 4) AS score
             FROM recipes
            WHERE is_published AND search_tsv @@ websearch_to_tsquery('english', $1)
            ORDER BY score DESC
            LIMIT $2`,
          [q, limit]
        );
        topScore = rows[0]?.score;
      }
    }

    // ---- log the request (transaction) ------------------------------
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO search_log (user_id, query_text, recipe_id, rank_score)
         VALUES ($1, $2, $3, $4)`,
        [
          user.userId,
          q || '(no query)',
          rows[0]?.recipe_id ?? null,
          topScore == null ? null : Math.max(0, Number(topScore)),
        ]
      );
    });

    return NextResponse.json({ mode, query: q, notice, count: rows.length, results: rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
