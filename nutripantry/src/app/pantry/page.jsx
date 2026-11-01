import { query } from '@/lib/db';
import { currentUser, currentUserOrDemo } from '@/lib/auth';
import PantryWorkspace from './pantry-workspace';

export const dynamic = 'force-dynamic';

export default async function PantryPage() {
  const user = currentUserOrDemo();
  const signedIn = Boolean(currentUser());
  let rows = [];
  let ingredients = [];
  let error = null;

  try {
    // Reads the v_user_pantry VIEW, which derives the freshness label
    // in SQL rather than in JavaScript.
    rows = await query(
      `SELECT ingredient_id, ingredient_name, category, quantity, unit,
              to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date, freshness
         FROM v_user_pantry
        WHERE user_id = $1
        ORDER BY
          CASE freshness WHEN 'expired' THEN 0
                         WHEN 'expiring_soon' THEN 1
                         ELSE 2 END,
          ingredient_name`,
      [user.userId]
    );
    if (signedIn) {
      ingredients = await query(
        'SELECT ingredient_id, name, default_unit FROM ingredients ORDER BY name'
      );
    }
  } catch (e) {
    error = e.message;
  }

  if (error) return (
    <div className="note err" role="alert">
      Your pantry could not be loaded. Check the database connection and try again.
    </div>
  );

  return (
    <PantryWorkspace items={rows} ingredients={ingredients}
      userName={user.name} signedIn={signedIn} />
  );
}
