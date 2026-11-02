import Link from 'next/link';
import { query } from '@/lib/db';
import { currentUserOrDemo } from '@/lib/auth';
import IngredientSearch from './ingredient-search';
import styles from './search.module.css';

export const dynamic = 'force-dynamic';

export default async function RecommendPage({ searchParams = {} }) {
  const user = currentUserOrDemo();
  const raw = searchParams.ingredient;
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const requested = [...new Set(values.filter((v) => /^\d+$/.test(v)).map(Number))]
    .filter((n) => Number.isSafeInteger(n) && n > 0 && n <= 2147483647).slice(0, 100);
  const complete = searchParams.mode === 'complete';
  let ingredients = [], selected = [], rows = [], error = false;
  try {
    ingredients = await query('SELECT ingredient_id, name FROM ingredients ORDER BY name');
    selected = requested.filter((id) => ingredients.some((i) => i.ingredient_id === id));
    if (selected.length) {
      // Search the entire published catalogue, independent of the saved pantry.
      // CTE aggregates selected/missing ingredient names once per recipe.
      rows = await query(`
        WITH matches AS (
          SELECT r.recipe_id, r.title, r.description, r.instructions,
                 r.prep_time_minutes, r.calories, r.cuisine_type,
                 COUNT(*) AS total_ingredients,
                 COUNT(*) FILTER (WHERE ri.ingredient_id = ANY($1::int[])) AS matched_ingredients,
                 COALESCE(array_agg(i.name ORDER BY i.name)
                   FILTER (WHERE ri.ingredient_id = ANY($1::int[])), ARRAY[]::varchar[]) AS matched_names,
                 COALESCE(array_agg(i.name ORDER BY i.name)
                   FILTER (WHERE NOT (ri.ingredient_id = ANY($1::int[]))), ARRAY[]::varchar[]) AS missing_names
          FROM recipes r
          JOIN recipe_ingredients ri ON ri.recipe_id = r.recipe_id
          JOIN ingredients i ON i.ingredient_id = ri.ingredient_id
          WHERE r.is_published = TRUE
          GROUP BY r.recipe_id
        )
        SELECT *, matched_ingredients::numeric / total_ingredients AS match_ratio
        FROM matches
        WHERE matched_ingredients > 0
          AND ($2::boolean = FALSE OR matched_ingredients = total_ingredients)
        ORDER BY match_ratio DESC, matched_ingredients DESC, prep_time_minutes ASC, recipe_id
      `, [selected, complete]);
    } else if (!values.length) {
      rows = await query('SELECT * FROM fn_recommend_recipes($1, $2)', [user.userId, 10]);
    }
  } catch {
    error = true;
  }
  const searching = values.length > 0;
  return (
    <>
      <p className="eyebrow">Cook with what you have</p>
      <h2 className="page-title">Find your next meal</h2>
      <p className="muted">Choose the ingredients available to you and discover matching recipes.</p>
      <IngredientSearch ingredients={ingredients} selected={selected} complete={complete} />
      {error ? <p className="note err" role="alert">Recipes could not be loaded. Check the database connection and try again.</p> : <>
        <h2>{searching ? `Matching recipes (${rows.length})` : 'Recommended from your pantry'}</h2>
        {!searching && <p className="muted">Showing {user.name}&apos;s pantry recommendations. Choose ingredients above to search the full recipe catalogue.</p>}
        {searching && <p className="muted">{complete ? 'Every listed recipe ingredient is selected.' : 'Recipes share at least one selected ingredient, ranked by coverage.'} Quantities and expiry are not checked by this search.</p>}
        {rows.length === 0 ? <div className="pantry-empty"><h3>No recipes found</h3><p>{complete ? 'Try selecting more ingredients or switch to any matching ingredient.' : 'Choose different ingredients or add more to your selection.'}</p></div> :
          <div className={styles.results}>
            {rows.map((r) => <article className={`card ${styles.recipe}`} key={r.recipe_id}>
              <div className={styles.recipeHeading}><h3>{r.title}</h3><span className="pill fresh">{Math.round(Number(r.match_ratio) * 100)}% ingredients</span></div>
              <p className="muted">{r.prep_time_minutes} min · {Number(r.calories)} kcal{r.cuisine_type ? ` · ${r.cuisine_type}` : ''}</p>
              {r.description && <p>{r.description}</p>}
              <p><strong>{r.matched_ingredients} of {r.total_ingredients}</strong> recipe ingredients available</p>
              {searching && <><p><strong>You selected:</strong> {r.matched_names.join(', ')}</p><p><strong>Still needed:</strong> {r.missing_names.length ? r.missing_names.join(', ') : 'None — all ingredient names are selected.'}</p></>}
              {r.instructions && <details><summary>Cooking instructions</summary><p>{r.instructions}</p></details>}
            </article>)}
          </div>}
        <p><Link href="/pantry">Manage your pantry &rarr;</Link></p>
      </>}
    </>
  );
}
