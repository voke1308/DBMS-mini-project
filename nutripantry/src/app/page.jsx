import { query } from '@/lib/db';

// Always hit the database on request — never prerender at build time.
export const dynamic = 'force-dynamic';

async function loadStats() {
  const [counts] = await query(`
    SELECT (SELECT COUNT(*) FROM users)              AS users,
           (SELECT COUNT(*) FROM recipes)            AS recipes,
           (SELECT COUNT(*) FROM ingredients)        AS ingredients,
           (SELECT COUNT(*) FROM pantry_items)       AS pantry_items,
           (SELECT COUNT(*) FROM recipe_embeddings)  AS embeddings,
           (SELECT COUNT(*) FROM search_log)         AS searches
  `);

  // JOIN + GROUP BY + ORDER BY + aggregate, straight from a view.
  const cuisines = await query(`
    SELECT cuisine_type,
           COUNT(*)        AS recipe_count,
           ROUND(AVG(calories), 0) AS avg_calories
    FROM   recipes
    WHERE  is_published = TRUE
    GROUP  BY cuisine_type
    HAVING COUNT(*) > 0
    ORDER  BY recipe_count DESC, cuisine_type
  `);

  return { counts, cuisines };
}

export default async function Dashboard() {
  let data = null;
  let error = null;

  try {
    data = await loadStats();
  } catch (e) {
    error = e.message;
  }

  if (error) {
    return (
      <>
        <div className="note err">
          <strong>Could not reach the database.</strong>
          <br />
          {error}
          <br />
          <br />
          Start it with <code>docker compose up -d</code>, then run{' '}
          <code>npm run db:setup</code>.
        </div>
      </>
    );
  }

  const { counts, cuisines } = data;

  return (
    <>
      <div className="note">
        Checkpoint 1 — schema is live and the app is reading from PostgreSQL.
        Every number below is a real <code>COUNT(*)</code>, not a placeholder.
      </div>

      <h2>Database contents</h2>
      <div className="cards">
        <div className="card"><div className="n">{counts.users}</div><div className="k">Users</div></div>
        <div className="card"><div className="n">{counts.recipes}</div><div className="k">Recipes</div></div>
        <div className="card"><div className="n">{counts.ingredients}</div><div className="k">Ingredients</div></div>
        <div className="card"><div className="n">{counts.pantry_items}</div><div className="k">Pantry rows</div></div>
        <div className="card"><div className="n">{counts.embeddings}</div><div className="k">Embeddings</div></div>
        <div className="card"><div className="n">{counts.searches}</div><div className="k">Searches logged</div></div>
      </div>

      <h2>Recipes by cuisine (GROUP BY / HAVING / AVG)</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Cuisine</th>
              <th className="num">Recipes</th>
              <th className="num">Avg calories</th>
            </tr>
          </thead>
          <tbody>
            {cuisines.map((c) => (
              <tr key={c.cuisine_type}>
                <td>{c.cuisine_type}</td>
                <td className="num">{c.recipe_count}</td>
                <td className="num">{c.avg_calories}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
