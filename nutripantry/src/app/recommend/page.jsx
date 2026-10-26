import { query } from '@/lib/db';
import { currentUserOrDemo } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function RecommendPage() {
  const user = currentUserOrDemo();
  let rows = [];
  let goal = null;
  let error = null;

  try {
    // Stage 1 of the recommender, entirely inside the database.
    rows = await query('SELECT * FROM fn_recommend_recipes($1, $2)', [user.userId, 10]);
    const g = await query('SELECT fn_active_goal_calories($1) AS cals', [user.userId]);
    goal = g[0]?.cals;
  } catch (e) {
    error = e.message;
  }

  if (error) return <div className="note err">Database error: {error}</div>;

  return (
    <>
      <div className="note">
        <strong>Stage 1 — SQL ranking.</strong> Recipes scored by how much of
        each one is already in {user.name}&apos;s pantry (60%) and how well the
        calories fit the active goal (40%), via the stored function{' '}
        <code>fn_recommend_recipes</code>.
        {goal
          ? ` Daily target: ${Number(goal)} kcal, so ~${Math.round(Number(goal) / 3)} kcal per meal.`
          : ' No active goal set — defaulting to 2000 kcal/day.'}
        <br />
        <br />
        <strong>Stage 2 — semantic re-ranking</strong> with pgvector is
        checkpoint 2. It will reorder this same list against a free-text
        craving using cosine distance.
      </div>

      <h2>Recommended for you</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Recipe</th>
              <th className="num">You have</th>
              <th className="num">Match</th>
              <th className="num">Calories</th>
              <th className="num">Fit</th>
              <th className="num">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.recipe_id}>
                <td>{r.title}</td>
                <td className="num">
                  {r.matched_ingredients}/{r.total_ingredients}
                </td>
                <td className="num">{(Number(r.match_ratio) * 100).toFixed(0)}%</td>
                <td className="num">{Number(r.calories).toFixed(0)}</td>
                <td className="num">{(Number(r.nutrition_fit) * 100).toFixed(0)}%</td>
                <td className="num">
                  <strong>{Number(r.score).toFixed(3)}</strong>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  Nothing matched — this user&apos;s pantry shares no ingredient
                  with any published recipe.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
