import { query } from '@/lib/db';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = currentUser();

  // Role-based access (requirement 11): only admins see this page.
  if (!user) {
    return (
      <div className="note">
        Admin area. <a href="/login">Sign in</a> as{' '}
        <code>admin@nutripantry.dev</code> to view it.
      </div>
    );
  }
  if (user.role !== 'admin') {
    return (
      <div className="note err">
        403 — this page is restricted to the <strong>admin</strong> role. You
        are signed in as <strong>{user.role}</strong>.
      </div>
    );
  }

  let popular = [];
  let overview = [];
  let error = null;

  try {
    popular = await query(
      'SELECT name, category, pantry_count, recipe_count FROM v_admin_popular_ingredients LIMIT 10'
    );
    overview = await query(
      'SELECT title, cuisine_type, ingredient_count, calories FROM v_recipe_overview ORDER BY ingredient_count DESC'
    );
  } catch (e) {
    error = e.message;
  }

  if (error) return <div className="note err">Database error: {error}</div>;

  return (
    <>
      <div className="note">
        Signed in as <strong>{user.name}</strong> (admin). Both tables read
        from views, so the SQL lives in the database rather than the app.
      </div>

      <h2>Most common ingredients across pantries</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Category</th>
              <th className="num">In pantries</th>
              <th className="num">In recipes</th>
            </tr>
          </thead>
          <tbody>
            {popular.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>{p.category}</td>
                <td className="num">{p.pantry_count}</td>
                <td className="num">{p.recipe_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Recipe catalogue</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Cuisine</th>
              <th className="num">Ingredients</th>
              <th className="num">Calories</th>
            </tr>
          </thead>
          <tbody>
            {overview.map((r) => (
              <tr key={r.title}>
                <td>{r.title}</td>
                <td>{r.cuisine_type}</td>
                <td className="num">{r.ingredient_count}</td>
                <td className="num">{Number(r.calories).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
