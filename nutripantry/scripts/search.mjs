#!/usr/bin/env node
/**
 * Natural-language recipe search from the terminal — handy for the demo
 * and for screenshots of real vector results.
 *
 *   npm run db:search -- "something sweet for breakfast"
 *   npm run db:search -- "high protein dinner" --user 3 --limit 5
 *
 * Prints (1) pure vector retrieval, fn_semantic_search, and
 * (2) the hybrid ranking, fn_hybrid_search, for the chosen user.
 */
import { connect } from './db-client.mjs'; // loads .env.local first
import { embed, toVectorLiteral } from '../src/lib/embedder.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const userId = flag('--user', 2);
const limit = flag('--limit', 5);
const text = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')).join(' ').trim();

if (!text) {
  console.error('Usage: npm run db:search -- "your query" [--user 2] [--limit 5]');
  process.exit(1);
}

const client = await connect();
try {
  const vector = toVectorLiteral(await embed(text));
  const { rows: [who] } = await client.query(
    'SELECT name, fn_active_goal_calories(user_id) AS goal FROM users WHERE user_id = $1',
    [userId]
  );
  if (!who) throw new Error(`No user with id ${userId}`);

  console.log(`\nQuery: "${text}"`);
  console.log(`User : ${who.name} (id ${userId}), daily goal ${who.goal ?? 'none'} kcal\n`);

  console.log('1) Vector only  —  SELECT * FROM fn_semantic_search($query, ' + limit + ')');
  const semantic = await client.query('SELECT * FROM fn_semantic_search($1::vector, $2)', [vector, limit]);
  console.table(
    semantic.rows.map((r) => ({
      recipe: r.title,
      cuisine: r.cuisine_type,
      distance: Number(r.distance),
      similarity: Number(r.similarity),
    }))
  );

  console.log(`2) Hybrid  —  SELECT * FROM fn_hybrid_search(${userId}, $query, ${limit})`);
  console.log('   score = 0.7 x relevance + 0.2 x pantry + 0.1 x goal_fit   (relevance = similarity rescaled 0..1)');
  const hybrid = await client.query('SELECT * FROM fn_hybrid_search($1, $2::vector, $3)', [
    userId,
    vector,
    limit,
  ]);
  console.table(
    hybrid.rows.map((r) => ({
      rank: r.rank,
      recipe: r.title,
      have: `${r.matched_ingredients}/${r.total_ingredients}`,
      similarity: Number(r.similarity),
      relevance: Number(r.relevance),
      pantry: Number(r.pantry),
      goal_fit: Number(r.goal_fit),
      score: Number(r.score),
    }))
  );
} catch (err) {
  console.error(`Search failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
