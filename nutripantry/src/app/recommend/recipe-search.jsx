'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const EXAMPLES = [
  'warm comforting vegetarian curry',
  'spicy high protein dinner',
  'something sweet for breakfast',
  'what can I make with chickpeas',
];

const pct = (v) => `${Math.round(Number(v) * 100)}%`;
const num = (v, d = 3) => Number(v).toFixed(d);

/** Natural-language recipe search backed by pgvector. */
export default function RecipeSearch({ signedIn, embedded }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [mode, setMode] = useState('hybrid');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  async function run(queryText = text, queryMode = mode) {
    const q = queryText.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q, mode: queryMode, limit: '8' });
      const res = await fetch(`/api/recommend?${params}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(res.status === 401 ? 'Your session has ended. Sign in again to search.' : data.error);
      }
      setResult(data);
      startTransition(() => router.refresh()); // refresh "Recent searches"
    } catch (err) {
      setError(err instanceof TypeError ? 'Could not connect. Try again.' : err.message);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    run();
  }

  function runExample(example) {
    setText(example);
    run(example, mode);
  }

  const intro = (
    <p className="muted small">
      Describe a meal in your own words. The text becomes a 384-number vector
      (all-MiniLM-L6-v2) and is compared with every recipe&apos;s vector in PostgreSQL
      using pgvector&apos;s cosine distance, then combined with your pantry and calorie goal.
      {embedded && Number(embedded.ready) < Number(embedded.total) && (
        <>
          {' '}
          <strong>
            Only {embedded.ready} of {embedded.total} recipes have embeddings
          </strong>{' '}
          — run <code>npm run db:embed</code> to include the rest.
        </>
      )}
    </p>
  );

  if (!signedIn) {
    return (
      <section className="card recipe-search" aria-labelledby="search-heading">
        <h2 id="search-heading">Search by meaning</h2>
        {intro}
        <p className="note">
          <Link href="/login">Sign in</Link> to search recipes in your own words.
        </p>
      </section>
    );
  }

  return (
    <section className="card recipe-search" aria-labelledby="search-heading">
      <h2 id="search-heading">Search by meaning</h2>
      {intro}
      <form className="search-row" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="recipe-query">Describe what you feel like eating</label>
        <input
          id="recipe-query"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. light vegetarian dinner with paneer"
          maxLength={300}
          required
        />
        <label className="sr-only" htmlFor="search-mode">Ranking</label>
        <select id="search-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="hybrid">Best for me (meaning + pantry + goal)</option>
          <option value="semantic">Closest in meaning only</option>
        </select>
        <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </form>

      <div className="chips" aria-label="Example searches">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="chip" disabled={loading} onClick={() => runExample(ex)}>
            {ex}
          </button>
        ))}
      </div>

      {loading && !result && (
        <p className="muted small">The first search loads the embedding model, which can take a few seconds.</p>
      )}
      {error && <p className="note err" role="alert">{error}</p>}

      {result && <Results data={result} />}
    </section>
  );
}

function Results({ data }) {
  const { mode, query, results, notice } = data;

  return (
    <div className="search-results" role="status">
      {notice && <p className="note err">{notice}</p>}
      <p className="formula">
        {mode === 'hybrid' && (
          <>
            <strong>score</strong> = 0.7 × relevance + 0.2 × pantry + 0.1 × goal fit.
            Relevance is the cosine similarity between your words and each recipe,
            rescaled so the closest recipe is 100%.
          </>
        )}
        {mode === 'semantic' && (
          <>
            Ranked purely by cosine distance (<code>embedding &lt;=&gt; query</code>):
            similarity = 1 − distance, so higher means closer in meaning.
          </>
        )}
        {mode === 'fulltext' && <>Ranked by keyword match (<code>ts_rank</code>).</>}
      </p>

      {results.length === 0 ? (
        <p className="pantry-empty">No recipes matched “{query}”.</p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              {mode === 'hybrid' ? (
                <tr>
                  <th className="num">#</th>
                  <th>Recipe</th>
                  <th className="num">Similarity</th>
                  <th className="num">Relevance</th>
                  <th className="num">You have</th>
                  <th className="num">Goal fit</th>
                  <th className="num">Score</th>
                </tr>
              ) : (
                <tr>
                  <th className="num">#</th>
                  <th>Recipe</th>
                  <th>Cuisine</th>
                  {mode === 'semantic' && <th className="num">Cosine distance</th>}
                  <th className="num">{mode === 'semantic' ? 'Similarity' : 'Rank score'}</th>
                </tr>
              )}
            </thead>
            <tbody>
              {results.map((r, i) =>
                mode === 'hybrid' ? (
                  <tr key={r.recipe_id}>
                    <td className="num">{r.rank}</td>
                    <td>
                      {r.title}
                      <span className="recipe-meta">{r.cuisine_type} · {Number(r.calories).toFixed(0)} kcal</span>
                    </td>
                    <td className="num">{num(r.similarity)}</td>
                    <td className="num">
                      <span className="bar" style={{ '--w': pct(r.relevance) }} aria-hidden="true" />
                      {pct(r.relevance)}
                    </td>
                    <td className="num">{r.matched_ingredients}/{r.total_ingredients}</td>
                    <td className="num">{pct(r.goal_fit)}</td>
                    <td className="num"><strong>{num(r.score)}</strong></td>
                  </tr>
                ) : (
                  <tr key={r.recipe_id}>
                    <td className="num">{i + 1}</td>
                    <td>{r.title}</td>
                    <td>{r.cuisine_type}</td>
                    {mode === 'semantic' && <td className="num">{num(r.distance, 4)}</td>}
                    <td className="num"><strong>{num(mode === 'semantic' ? r.similarity : r.score, 4)}</strong></td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
