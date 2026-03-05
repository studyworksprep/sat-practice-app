'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabase/browser';

export default function NavBar() {
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);

  async function fetchProfile(uid) {
    if (!uid) { setRole(null); return; }
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .maybeSingle();
    setRole(data?.role || 'practice');
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user ?? null;
      setUser(u);
      fetchProfile(u?.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      fetchProfile(u?.id);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher' || role === 'admin';
  const isPractice = role === 'practice';
  const homeHref = user ? (isPractice ? '/practice' : '/dashboard') : '/';

  return (
    <nav className="nav">
      <div className="navInner">

        {/* Left: Logo + Nav */}
        <div className="navLeft">
          <Link href={homeHref}>
            <img
              src="/studyworks-logo.png"
              alt="Studyworks"
              className="logo"
            />
          </Link>

          {user && (
            <div className="navLinks">
              {!isPractice && <Link href="/dashboard">Dashboard</Link>}
              {!isPractice && <Link href="/practice-test">Tests</Link>}
              <Link href="/practice">Practice</Link>
              {isAdmin && <Link href="/admin">Admin</Link>}
            </div>
          )}
        </div>

        {/* Right: Auth */}
        <div className="navRight">
          {user ? (
            <>
              <span className="userEmail">{user.email}</span>
              {role && (
                <span className="navRoleBadge">{role}</span>
              )}
              <button className="btn secondary" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link className="btn secondary" href="/">Log in</Link>
              <Link className="btn" href="/">Sign up</Link>
            </>
          )}
        </div>

      </div>
    </nav>
  );
}
