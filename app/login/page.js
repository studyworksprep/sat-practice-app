'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/browser';
import Toast from '../../components/Toast';

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMsg({ kind: 'danger', text: error.message });
    window.location.href = '/dashboard';
  }

  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="h1">Log in</div>
        <form onSubmit={onSubmit}>
          <label>Email</label>
          <input className="input" value={email} onChange={e => setEmail(e.target.value)} type="email" required />
          <label>Password</label>
          <input className="input" value={password} onChange={e => setPassword(e.target.value)} type="password" required />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" type="submit">Log in</button>
            <Link className="btn secondary" href="/signup">Create account</Link>
          </div>
          <Toast kind={msg?.kind} message={msg?.text} />
        </form>
      </div>
    </main>
  );
}
