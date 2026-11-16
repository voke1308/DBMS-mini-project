import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { withPantryAccess } from '@/lib/db';

export async function POST(request) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { calories, protein, carbs, fat } = body ?? {};
  if (!Number.isFinite(calories) || calories < 500 || calories > 6000 ||
      ![protein, carbs, fat].every((value) => Number.isFinite(value) && value >= 0 && value <= 9999.99)) {
    return NextResponse.json({ error: 'Enter 500 to 6000 kcal and valid nonnegative amounts for each macro.' }, { status: 400 });
  }

  try {
    await withPantryAccess(user.userId, async (client) => {
      // Serialize goal changes for this account before the insert trigger retires the old goal.
      await client.query('SELECT pg_advisory_xact_lock(1308, $1)', [user.userId]);
      await client.query(
        `INSERT INTO nutrition_goals (user_id, daily_calories, protein_g, carbs_g, fat_g)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.userId, calories, protein, carbs, fat]
      );
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error.code === '23503') return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    return NextResponse.json({ error: 'Could not save your nutrition goal.' }, { status: 500 });
  }
}
