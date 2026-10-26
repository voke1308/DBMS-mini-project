import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** GET /api/health — proves the app can reach PostgreSQL and that the
 *  pgvector extension is installed. Useful as the first demo step. */
export async function GET() {
  try {
    const [version] = await query('SELECT version() AS v');
    const ext = await query(
      "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'"
    );
    const [tables] = await query(
      `SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );

    return NextResponse.json({
      status: 'ok',
      postgres: version.v.split(' ').slice(0, 2).join(' '),
      pgvector: ext[0]?.extversion ?? 'NOT INSTALLED',
      tables: Number(tables.n),
    });
  } catch (err) {
    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}
