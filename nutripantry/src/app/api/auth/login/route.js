import { NextResponse } from 'next/server';
import { authenticate, createSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** POST /api/auth/login  { email, password } */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, password } = body ?? {};
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  try {
    const user = await authenticate(email, password);
    if (!user) {
      // Same message for both cases — don't leak which emails exist.
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const res = NextResponse.json({ name: user.name, role: user.role });
    res.cookies.set(createSessionCookie(user));
    return res;
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
