import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** GET /api/pantry — the signed-in user's pantry, from the view. */
export async function GET() {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const rows = await query(
      `SELECT ingredient_id, ingredient_name, category, quantity, unit,
              expiry_date, freshness
         FROM v_user_pantry
        WHERE user_id = $1
        ORDER BY ingredient_name`,
      [user.userId]
    );
    return NextResponse.json({ items: rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST /api/pantry  { ingredientId, quantity, unit, expiryDate? }
 *  Runs the stored procedure inside a transaction. The BEFORE INSERT
 *  trigger rejects already-expired dates at the database level. */
export async function POST(request) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ingredientId, quantity, unit, expiryDate = null } = body ?? {};
  if (!Number.isInteger(ingredientId) || typeof quantity !== 'number') {
    return NextResponse.json(
      { error: 'ingredientId (integer) and quantity (number) are required' },
      { status: 400 }
    );
  }

  try {
    await withTransaction(async (client) => {
      await client.query('CALL sp_upsert_pantry_item($1, $2, $3, $4, $5)', [
        user.userId,
        ingredientId,
        quantity,
        unit || 'g',
        expiryDate,
      ]);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Trigger and CHECK violations surface here with a readable message.
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
