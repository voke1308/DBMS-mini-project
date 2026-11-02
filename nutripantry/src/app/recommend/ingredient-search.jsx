'use client';

import { useState } from 'react';

import Link from 'next/link';
import styles from './search.module.css';

function SearchButton({ disabled, pending }) {

  return <button type="submit" disabled={disabled || pending}>{pending ? 'Finding recipes...' : 'Find recipes'}</button>;
}

export default function IngredientSearch({ ingredients, selected, complete }) {
  const [ids, setIds] = useState(selected);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [mode, setMode] = useState(complete ? 'complete' : 'any');
  const available = ingredients.filter((i) => !ids.includes(i.ingredient_id) && i.name.toLowerCase().includes(filter.trim().toLowerCase()));
  function add(value) {
    const id = Number(value);
    if (ingredients.some((i) => i.ingredient_id === id)) setIds((previous) => previous.includes(id) ? previous : [...previous, id]);
  }
  return <form action="/recommend" method="get" onSubmit={() => setBusy(true)} className={`card ${styles.search}`}>
    <h2>Search by ingredients</h2>
    <div className={styles.controls}>
      <label>Filter ingredient options
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type rice, tomato..." />
      </label>
      <label>Add an available ingredient
        <select value="" onChange={(e) => add(e.target.value)} disabled={!available.length}>
          <option value="">{available.length ? 'Choose an ingredient' : 'No more matching ingredients'}</option>
          {available.map((i) => <option key={i.ingredient_id} value={i.ingredient_id}>{i.name}</option>)}
        </select>
      </label>
    </div>
    <div className={styles.chips} aria-label="Selected ingredients">
      {ids.map((id) => <span key={id} className={styles.chip}>
        <input type="hidden" name="ingredient" value={id} />
        {ingredients.find((i) => i.ingredient_id === id)?.name}
        <button type="button" aria-label={`Remove ${ingredients.find((i) => i.ingredient_id === id)?.name}`} onClick={() => setIds(ids.filter((v) => v !== id))}>×</button>
      </span>)}
    </div>
    <p role="status" className="muted">{ids.length ? `${ids.length} ingredient${ids.length === 1 ? '' : 's'} selected. Click Find recipes to update results.` : 'Select one or more ingredients to search.'}</p>
    <label className={styles.mode}>Match preference
      <select name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="any">Any matching ingredient</option>
        <option value="complete">All recipe ingredients available</option>
      </select>
    </label>
    <div className={styles.actions}>
      <SearchButton disabled={!ids.length} pending={busy} />
      <button type="button" className="secondary" onClick={() => { setIds([]); setFilter(''); setMode('any'); }}>Clear selection</button>
      <Link href="/recommend" onClick={() => { setIds([]); setFilter(''); setMode('any'); setBusy(false); }}>Reset results</Link>
    </div>
    {ingredients.length === 0 && <p className="note">No ingredient options are available. Check the database connection and seed data.</p>}
  </form>;
}
