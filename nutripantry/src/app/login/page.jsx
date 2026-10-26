'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('krishna@example.com');
  const [password, setPassword] = useState('password123');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setBusy(false);

    if (res.ok) {
      setMessage({ ok: true, text: `Signed in as ${data.name} (${data.role}).` });
      setTimeout(() => window.location.assign(data.role === 'admin' ? '/admin' : '/pantry'), 600);
    } else {
      setMessage({ ok: false, text: data.error || 'Login failed' });
    }
  }

  return (
    <>
      <div className="note">
        Seeded accounts, all with the password <code>password123</code>:
        <br />
        <code>admin@nutripantry.dev</code> (admin) ·{' '}
        <code>krishna@example.com</code> (user) ·{' '}
        <code>teammate@example.com</code> (user)
      </div>

      <h2>Sign in</h2>
      <form className="stack" onSubmit={onSubmit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>

      {message && (
        <p className={message.ok ? 'note' : 'note err'} style={{ marginTop: 16 }}>
          {message.text}
        </p>
      )}
    </>
  );
}
