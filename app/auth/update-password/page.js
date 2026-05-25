// Password reset landing — the destination for the email link
// supabase sends from app/login/page.js's "Forgot password?"
// flow. The /auth/callback route exchanges the code for a
// session before redirecting here, so by the time the user is
// looking at this page they're already authenticated; the form
// just needs to take a new password and call updateUser to
// rewrite the credential.
//
// If somebody lands here without a session (link expired,
// link reused after sign-out, etc.), the form bounces them to
// /login with an explanatory message instead of pretending the
// reset succeeded.
//
// Visual: matches the existing /login page's vocabulary
// (.container, .card, .input, .btn, password show/hide toggle,
// Toast banner) so a user moving from "Forgot password?" to
// the email link to this page sees one consistent visual tone.

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase/browser';
import Toast from '../../../components/Toast';

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
      return setMsg({ kind: 'danger', text: 'Password must be at least 8 characters.' });
    }
    if (password !== confirmPassword) {
      return setMsg({ kind: 'danger', text: 'Passwords do not match.' });
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return setMsg({ kind: 'danger', text: error.message });

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
      else if (profile?.role === 'teacher' || profile?.role === 'manager') dest = '/teacher';
      else if (profile?.role === 'admin') dest = '/admin';
    }
    setMsg({ kind: 'ok', text: 'Password updated. Redirecting…' });
    setTimeout(() => {
      window.location.href = dest;
    }, 600);
  }

  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
          Set a new password
        </h1>

        {hasSession === false && (
          <>
            <p style={{ marginBottom: 12 }}>
              This password reset link has expired or is no longer valid.
              Please request a new one from the login page.
            </p>
            <a className="btn" href="/login">Back to log in</a>
          </>
        )}

        {hasSession === true && (
          <form onSubmit={handleSubmit}>
            <label>New password</label>
            <div className="passwordWrap">
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
              />
              <button
                type="button"
                className="passwordToggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>

            <label>Confirm new password</label>
            <div className="passwordWrap">
              <input
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
              />
              <button
                type="button"
                className="passwordToggle"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>

            <div className="sw-row" style={{ marginTop: 16 }}>
              <button className="btn" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Update password'}
              </button>
            </div>
            <Toast kind={msg?.kind} message={msg?.text} />
          </form>
        )}

        {hasSession === null && (
          <p className="small" style={{ color: '#9ca3af' }}>Loading…</p>
        )}
      </div>
    </main>
  );
}
