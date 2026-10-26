#!/usr/bin/env node
/**
 * Runs every db/*.sql file in order against the configured database.
 *
 *   npm run db:setup
 *
 * Reads credentials from .env.local / the environment only.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const dbDir = join(here, '..', 'db');

// Minimal .env.local loader so the script works without extra deps.
try {
  const env = readFileSync(join(here, '..', '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  console.warn('No .env.local found — relying on existing environment variables.');
}

const client = new pg.Client(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
      }
);

const files = readdirSync(dbDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

await client.connect();
console.log(`Connected to ${process.env.PGDATABASE || 'database'}\n`);

for (const file of files) {
  const sql = readFileSync(join(dbDir, file), 'utf8');
  process.stdout.write(`  ${file.padEnd(22)}`);
  try {
    await client.query(sql);
    console.log('ok');
  } catch (err) {
    console.log('FAILED');
    console.error(`\n${err.message}\n`);
    await client.end();
    process.exit(1);
  }
}

const { rows } = await client.query(`
  SELECT (SELECT COUNT(*) FROM users)       AS users,
         (SELECT COUNT(*) FROM recipes)     AS recipes,
         (SELECT COUNT(*) FROM ingredients) AS ingredients
`);
console.log(`\nSeeded: ${rows[0].users} users, ${rows[0].recipes} recipes, ${rows[0].ingredients} ingredients.`);

await client.end();
