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
    <nav className="nav">
      <div className="navInner">

        {/* Left: Logo + Nav */}
        <div className="navLeft">
          <Link href="/">
            <img
              src="/studyworks-logo.png"
              alt="Studyworks"
              className="logo"
            />
          </Link>

          <div className="navLinks">
            <Link href="/practice">Practice</Link>
            <Link href="/review">Review</Link>
            {user ? <Link href="/question-bank">Question Bank</Link> : null}
          </div>
        </div>

        {/* Right: Auth */}
        <div className="navRight">
          {user ? (
            <>
              <span className="userEmail">{user.email}</span>
              <button className="btn secondary" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link className="btn secondary" href="/login">Log in</Link>
              <Link className="btn" href="/signup">Sign up</Link>
            </>
          )}
        </div>

      </div>
    </nav>
  );
}
