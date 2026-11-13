'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function NutritionGoal({ goal }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [message, setMessage] = useState(null);
  const busy = saving || refreshing;

  async function saveGoal(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const values = Object.fromEntries(
      ['calories', 'protein', 'carbs', 'fat'].map((name) => [name, Number(fields.get(name))])
    );
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 401
        ? 'Sign in again to save your goal.' : data.error);
      setMessage({ ok: true, text: 'Nutrition goal saved.' });
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage({ ok: false, text: error instanceof TypeError
        ? 'Could not connect. Check your connection and try again.' : error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card pantry-add" aria-labelledby="goal-title">
      <h2 id="goal-title">Daily nutrition goal</h2>
      <p className="muted">Your calorie target helps rank pantry recommendations.</p>
      <form className="stack" key={goal?.goal_id} onSubmit={saveGoal}>
        <fieldset disabled={busy}>
          <label htmlFor="goal-calories">Calories (kcal)</label>
          <input id="goal-calories" name="calories" type="number" min="500" max="6000" step="0.01" defaultValue={goal?.daily_calories ?? 2000} required />
          <label htmlFor="goal-protein">Protein (g)</label>
          <input id="goal-protein" name="protein" type="number" min="0" max="9999.99" step="0.01" defaultValue={goal?.protein_g ?? 0} required />
          <label htmlFor="goal-carbs">Carbohydrates (g)</label>
          <input id="goal-carbs" name="carbs" type="number" min="0" max="9999.99" step="0.01" defaultValue={goal?.carbs_g ?? 0} required />
          <label htmlFor="goal-fat">Fat (g)</label>
          <input id="goal-fat" name="fat" type="number" min="0" max="9999.99" step="0.01" defaultValue={goal?.fat_g ?? 0} required />
          <button type="submit">{busy ? 'Saving...' : 'Save nutrition goal'}</button>
        </fieldset>
      </form>
      {message && <p className={message.ok ? 'note' : 'note err'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </section>
  );
}
