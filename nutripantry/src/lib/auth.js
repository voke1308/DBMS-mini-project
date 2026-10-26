import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { query } from './db';

const COOKIE = 'np_session';

/**
 * Checkpoint-1 session handling: a signed, httpOnly cookie holding the
 * user id and role. Simple on purpose — it is swapped for a proper
 * session table before the final submission.
 *
 * Passwords are never stored or compared in plain text: the database
 * only ever sees a bcrypt hash (requirement 13).
 */

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set — copy .env.example to .env.local');
  return s;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  // timing-safe comparison
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

/** Verify an email + password against the database. */
export async function authenticate(email, password) {
  const rows = await query(
    'SELECT user_id, name, email, password_hash, role FROM users WHERE email = $1',
    [email]
  );
  if (rows.length === 0) return null;

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;

  return { userId: user.user_id, name: user.name, email: user.email, role: user.role };
}

export function createSessionCookie(user) {
  return {
    name: COOKIE,
    value: sign(user),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  };
}

/** Read the current user from the request cookies, or null. */
export function currentUser() {
  const token = cookies().get(COOKIE)?.value;
  return verify(token);
}

/** For the demo pages: fall back to the seeded user so the checkpoint
 *  renders real data before login is wired into every page. */
export function currentUserOrDemo() {
  return currentUser() ?? { userId: 2, name: 'Krishna (demo)', role: 'user' };
}

export const SESSION_COOKIE = COOKIE;
