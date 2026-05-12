// Password-reset landing — destination for the magic link supabase
// sends from HomeClient's "Forgot password?" flow. /auth/callback
// exchanges the recovery code for a session before redirecting here,
// so by the time this page renders the user is authenticated; the
// form just takes a new password and calls updateUser to rewrite
// the credential.
//
// If somebody lands here without a session (link expired, link
// reused after sign-out, kill-switched), the form hides itself and
// the user is prompted to request a fresh reset link.

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import s from './UpdatePassword.module.css';

export default function UpdatePasswordPage() {
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  // Three states for the session check:
  //   null    — checking
  //   true    — authenticated, ready to accept a new password
  //   false   — no session, the form is hidden and the user is
  //             prompted to request a fresh reset link
  const [hasSession, setHasSession] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setHasSession(!!data?.user);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 8) {
      setMsg({ kind: 'err', text: 'Password must be at least 8 characters.' });
      return;
    }
    if (password !== confirmPassword) {
      setMsg({ kind: 'err', text: 'Passwords do not match.' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setMsg({ kind: 'err', text: error.message });
      return;
    }

    // Resolve a role-appropriate landing so the user doesn't end
    // up on a generic page after the reset succeeds.
    let dest = '/dashboard';
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle();
      if (profile?.role === 'practice') dest = '/practice';
      else if (profile?.role === 'teacher' || profile?.role === 'manager') dest = '/tutor/dashboard';
      else if (profile?.role === 'admin') dest = '/admin';
    }
    setMsg({ kind: 'ok', text: 'Password updated. Redirecting…' });
    setTimeout(() => {
      window.location.href = dest;
    }, 600);
  }

  return (
    <main className={s.page}>
      <div className={s.card}>
        <h1 className={s.h1}>Set a new password</h1>

        {hasSession === null && (
          <p className={s.muted}>Loading…</p>
        )}

        {hasSession === false && (
          <>
            <p className={s.body}>
              This password reset link has expired or is no longer valid.
              Please request a new one from the login page.
            </p>
            <a className={s.submit} href="/login">Back to log in</a>
          </>
        )}

        {hasSession === true && (
          <form onSubmit={handleSubmit} className={s.form}>
            <div className={s.field}>
              <label className={s.label}>New password</label>
              <div className={s.passwordWrap}>
                <input
                  className={s.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
              </div>
            </div>

            <div className={s.field}>
              <label className={s.label}>Confirm new password</label>
              <div className={s.passwordWrap}>
                <input
                  className={s.input}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <PasswordToggle
                  shown={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((v) => !v)}
                />
              </div>
            </div>

            <button className={s.submit} type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Update password'}
            </button>

            {msg && (
              <div className={`${s.banner} ${msg.kind === 'ok' ? s.bannerOk : s.bannerErr}`}>
                {msg.text}
              </div>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

function PasswordToggle({ shown, onToggle }) {
  return (
    <button
      type="button"
      className={s.passwordToggle}
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
    >
      {shown ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}
