'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/browser';
import Toast from '../../components/Toast';

export default function SignupPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return setMsg({ kind: 'danger', text: error.message });
    setMsg({ kind: 'ok', text: 'Account created. Check your email to confirm (if enabled), then log in.' });
  }

  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="h1">Sign up</div>
        <form onSubmit={onSubmit}>
          <label>Email</label>
          <input className="input" value={email} onChange={e => setEmail(e.target.value)} type="email" required />
          <label>Password</label>
          <input className="input" value={password} onChange={e => setPassword(e.target.value)} type="password" required />
          <p className="muted small">Use a strong password. You can enforce password rules in Supabase Auth settings.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" type="submit">Create account</button>
            <Link className="btn secondary" href="/login">Back to login</Link>
          </div>
          <Toast kind={msg?.kind} message={msg?.text} />
        </form>
      </div>
    </main>
  );
}
