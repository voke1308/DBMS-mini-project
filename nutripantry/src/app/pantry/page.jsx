import { query } from '@/lib/db';
import { currentUserOrDemo } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function PantryPage() {
  const user = currentUserOrDemo();
  let rows = [];
  let error = null;

  try {
    // Reads the v_user_pantry VIEW, which derives the freshness label
    // in SQL rather than in JavaScript.
    rows = await query(
      `SELECT ingredient_name, category, quantity, unit, expiry_date, freshness
         FROM v_user_pantry
        WHERE user_id = $1
        ORDER BY
          CASE freshness WHEN 'expired' THEN 0
                         WHEN 'expiring_soon' THEN 1
                         ELSE 2 END,
          ingredient_name`,
      [user.userId]
    );
  } catch (e) {
    error = e.message;
  }

  if (error) return <div className="note err">Database error: {error}</div>;

  return (
    <>
      <div className="note">
        Pantry for <strong>{user.name}</strong> — served from the{' '}
        <code>v_user_pantry</code> view. Adding and editing items is
        checkpoint 2; the API route <code>/api/pantry</code> already accepts
        writes through the <code>sp_upsert_pantry_item</code> procedure.
      </div>

      <h2>Current pantry ({rows.length} items)</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Category</th>
              <th className="num">Quantity</th>
              <th>Expires</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ingredient_name}>
                <td>{r.ingredient_name}</td>
                <td>{r.category}</td>
                <td className="num">
                  {Number(r.quantity)} {r.unit}
                </td>
                <td>
                  {r.expiry_date
                    ? new Date(r.expiry_date).toISOString().slice(0, 10)
                    : '—'}
                </td>
                <td>
                  <span className={`pill ${r.freshness}`}>
                    {r.freshness.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
