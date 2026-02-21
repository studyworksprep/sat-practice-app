'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabase/browser';

export default function NavBar() {
  const supabase = createClient();
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <div className="container" style={{ paddingTop: 16, paddingBottom: 10 }}>
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="row" style={{ alignItems: 'center' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src="/studyworks-logo.png"
              alt="Studyworks"
              style={{ height: 36 }}
            />
          </Link>
          <Link href="/practice" className="pill">Practice</Link>
          <Link href="/review" className="pill">Review</Link>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          {user ? (
            <>
              <span className="pill">
                <span className="muted">Signed in</span>
                <span className="kbd">{user.email}</span>
              </span>
              <button className="btn secondary" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              <Link className="btn secondary" href="/login">Log in</Link>
              <Link className="btn" href="/signup">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
