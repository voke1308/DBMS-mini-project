import { query } from '@/lib/db';
import { currentUser, currentUserOrDemo } from '@/lib/auth';
import PantryWorkspace from './pantry-workspace';
import NutritionGoal from './nutrition-goal';

export const dynamic = 'force-dynamic';

export default async function PantryPage() {
  const user = currentUserOrDemo();
  const signedIn = Boolean(currentUser());
  let rows = [];
  let ingredients = [];
  let goal = null;
  let error = null;

  try {
    // Reads the v_user_pantry VIEW, which derives the freshness label
    // in SQL rather than in JavaScript.
    rows = await query(
      `SELECT pantry_item_id, ingredient_id, ingredient_name, category, quantity, unit,
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
      [goal = null] = await query(
        `SELECT goal_id, daily_calories, protein_g, carbs_g, fat_g
         FROM nutrition_goals
         WHERE user_id = $1 AND is_active AND (end_date IS NULL OR end_date >= CURRENT_DATE)
         ORDER BY start_date DESC, goal_id DESC LIMIT 1`,
        [user.userId]
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
    <>
      <PantryWorkspace items={rows} ingredients={ingredients}
        userName={user.name} signedIn={signedIn} />
      {signedIn && <NutritionGoal goal={goal} />}
    </>
  );
}
