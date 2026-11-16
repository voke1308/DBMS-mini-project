import { NextResponse } from 'next/server';
import { withPantryAccess } from '@/lib/db';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** GET /api/pantry — the signed-in user's pantry, from the view. */
export async function GET() {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const { rows } = await withPantryAccess(user.userId, (client) => client.query(
      `SELECT ingredient_id, ingredient_name, category, quantity, unit,
              expiry_date, freshness
         FROM v_user_pantry
        WHERE user_id = $1
        ORDER BY ingredient_name`,
      [user.userId]
    ));
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
    await withPantryAccess(user.userId, async (client) => {
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

async function changePantryItem(request, remove) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { pantryItemId, quantity, expiryDate } = body ?? {};
  if (!Number.isInteger(pantryItemId) || pantryItemId < 1 || pantryItemId > 2147483647) {
    return NextResponse.json({ error: 'A valid pantry item ID is required.' }, { status: 400 });
  }

  if (!remove && (!Number.isFinite(quantity) || quantity < 0 || quantity > 99999999.99 ||
      (expiryDate !== null && (typeof expiryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate))))) {
    return NextResponse.json({ error: 'Enter a valid quantity and expiry date.' }, { status: 400 });
  }

  try {
    const { rows } = await withPantryAccess(user.userId, (client) => remove
      ? client.query(
        'DELETE FROM pantry_items WHERE pantry_item_id = $1 AND user_id = $2 RETURNING pantry_item_id',
        [pantryItemId, user.userId]
      )
      : client.query(
        `UPDATE pantry_items SET quantity = $3, expiry_date = $4
         WHERE pantry_item_id = $1 AND user_id = $2 RETURNING pantry_item_id`,
        [pantryItemId, user.userId, quantity, expiryDate]
      ));

    if (!rows.length) {
      return NextResponse.json({ error: 'Pantry item not found.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error.code === 'P0001' || error.code === '22007' || error.code === '22008') {
      return NextResponse.json({ error: 'Use a valid expiry date that is today or later, or leave it blank.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Could not change this pantry item.' }, { status: 500 });
  }
}

export function PATCH(request) {
  return changePantryItem(request, false);
}

export function DELETE(request) {
  return changePantryItem(request, true);
}
