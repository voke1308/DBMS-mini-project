import { Pool } from 'pg';

/**
 * One connection pool for the whole app.
 *
 * Next.js reloads modules in development, so the pool is cached on
 * globalThis to stop a new pool being created on every hot reload.
 *
 * Credentials come from environment variables only — nothing is
 * hard-coded here (project requirement 10).
 */
const config = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
    };

const globalForDb = globalThis;

export const pool =
  globalForDb.__nutripantryPool ?? new Pool({ ...config, max: 10 });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__nutripantryPool = pool;
}

/** Run a parameterised query. Always pass values as `params` — never
 *  string-concatenate user input into SQL (requirement 13). */
export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

/** Run several statements inside a single transaction. Rolls back the
 *  whole unit of work if any statement throws (requirement 7). */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Role and owner context are local to this transaction, including on rollback.
// The account ID comes from the verified session (or the read-only demo account).
export function withPantryAccess(userId, work) {
  return withTransaction(async (client) => {
    await client.query('SET LOCAL ROLE nutripantry_member');
    await client.query("SELECT set_config('nutripantry.user_id', $1, true)", [String(userId)]);
    return work(client);
  });
}

export function withAdminReports(work) {
  return withTransaction(async (client) => {
    await client.query('SET LOCAL ROLE nutripantry_admin_report');
    return work(client);
  });
}
