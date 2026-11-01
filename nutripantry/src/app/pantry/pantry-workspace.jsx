'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const labels = {
  fresh: 'Fresh', expiring_soon: 'Use within 3 days',
  expired: 'Expired', no_expiry: 'No expiry set',
};

export default function PantryWorkspace({ items, ingredients, userName, signedIn }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [freshness, setFreshness] = useState('all');
  const [ingredientId, setIngredientId] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [message, setMessage] = useState(null);
  const busy = saving || refreshing;
  const categories = [...new Set(items.map((item) => item.category))].sort();
  const selected = ingredients.find((item) => item.ingredient_id === Number(ingredientId));
  const existing = items.find((item) => item.ingredient_id === Number(ingredientId));
  const unit = existing?.unit || selected?.default_unit || '';
  const visible = items.filter((item) =>
    item.ingredient_name.toLowerCase().includes(search.trim().toLowerCase()) &&
    (category === 'all' || item.category === category) &&
    (freshness === 'all' || item.freshness === freshness)
  );

  function resetFilters() {
    setSearch(''); setCategory('all'); setFreshness('all');
  }

  async function addItem(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setMessage(null);
    setSaving(true);
    try {
      const response = await fetch('/api/pantry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredientId: Number(ingredientId), quantity: Number(fields.get('quantity')),
          unit, expiryDate: fields.get('expiryDate') || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 401
        ? 'Your session has ended. Sign in again to save.'
        : data.error || 'Could not save this ingredient.');
      setMessage({ ok: true, text: `${selected.name} ${existing ? 'topped up' : 'added'} successfully.` });
      form.reset();
      setIngredientId('');
      resetFilters();
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage({ ok: false, text: error instanceof TypeError
        ? 'Could not connect. Check your connection and try again.' : error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="pantry-heading">
        <div>
          <p className="eyebrow">Plan with what you have</p>
          <h2 className="page-title">Your pantry</h2>
          <p className="muted">{userName}&apos;s ingredients, all in one place.</p>
        </div>
        <Link href="/recommend" className="button-link">Find recipes &rarr;</Link>
      </div>
      {!signedIn && <p className="note">You are exploring the demo pantry. <Link href="/login">Sign in</Link> to add your own ingredients.</p>}

      <div className="cards pantry-summary" aria-label="Pantry summary">
        <div className="card"><div className="k">Ingredients</div><div className="n">{items.length}</div><p>Across your pantry</p></div>
        <div className="card"><div className="k">Use soon</div><div className="n">{items.filter((i) => i.freshness === 'expiring_soon').length}</div><p>Expire within 3 days</p></div>
        <div className="card"><div className="k">Expired</div><div className="n">{items.filter((i) => i.freshness === 'expired').length}</div><p>Check before cooking</p></div>
      </div>

      <div className={`pantry-grid ${signedIn ? '' : 'pantry-grid-demo'}`}>
        <section aria-labelledby="inventory-title">
          <h2 id="inventory-title">Ingredient inventory</h2>
          <div className="pantry-filters">
            <label className="search-field">Search ingredients
              <input type="search" placeholder="Try rice or tomato" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <label>Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Freshness
              <select value={freshness} onChange={(e) => setFreshness(e.target.value)}>
                <option value="all">All statuses</option>
                {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <p className="result-count" role="status">Showing {visible.length} of {items.length} ingredients</p>
          <div className="tablewrap">
            <table>
              <caption className="sr-only">Pantry quantities and expiry dates</caption>
              <thead><tr><th scope="col">Ingredient</th><th scope="col" className="num">Quantity</th><th scope="col">Expiry</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {visible.map((item) => <tr key={item.ingredient_id}>
                  <td><strong>{item.ingredient_name}</strong><span className="ingredient-category">{item.category}</span></td>
                  <td className="num">{Number(item.quantity)} {item.unit}</td>
                  <td className="expiry-date">{item.expiry_date || 'Not set'}</td>
                  <td><span className={`pill ${item.freshness}`}>{labels[item.freshness] || item.freshness}</span></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && <div className="pantry-empty">
            <h3>{items.length ? 'No ingredients match' : 'Your pantry is empty'}</h3>
            <p>{items.length ? 'Try another name or clear your filters.' : signedIn ? 'Add an ingredient to start planning your meals.' : 'Sign in to start stocking your pantry.'}</p>
            {items.length > 0 && <button type="button" className="secondary" onClick={resetFilters}>Clear filters</button>}
          </div>}
        </section>

        {signedIn && <aside className="card pantry-add" aria-labelledby="add-title">
          <h2 id="add-title">Add an ingredient</h2>
          <p className="muted">Stock up for your next meal. Existing ingredients are topped up.</p>
          <form className="stack" onSubmit={addItem}>
            <fieldset disabled={busy}>
              <label htmlFor="ingredient">Ingredient</label>
              <select id="ingredient" value={ingredientId} required onChange={(e) => setIngredientId(e.target.value)}>
                <option value="">Choose an ingredient</option>
                {ingredients.map((i) => <option key={i.ingredient_id} value={i.ingredient_id}>{i.name}</option>)}
              </select>
              <label htmlFor="quantity">Quantity to add {unit && `(${unit})`}</label>
              <input id="quantity" name="quantity" type="number" min="0.01" max="99999999.99" step="0.01" placeholder="e.g. 250" required />
              {existing && <p className="field-help">Currently {Number(existing.quantity)} {unit}. This amount will be added to your stock.</p>}
              <label htmlFor="expiry">Expiry date (optional)</label>
              <input id="expiry" name="expiryDate" type="date" />
              <p className="field-help">Leave blank to keep the current date when topping up. Past dates are rejected.</p>
              <button type="submit" disabled={!selected || busy}>{busy ? 'Saving...' : existing ? 'Top up ingredient' : 'Add to pantry'}</button>
            </fieldset>
          </form>
          {message && <p className={message.ok ? 'note' : 'note err'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
        </aside>}
      </div>
    </>
  );
}
