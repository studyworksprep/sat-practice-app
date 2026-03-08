'use client';

import { useState } from 'react';
import { createClient } from '../../lib/supabase/browser';
import Toast from '../../components/Toast';

const CURRENT_YEAR = new Date().getFullYear();
const GRAD_YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR + i);

export default function LoginPage() {
  const supabase = createClient();
  const [tab, setTab] = useState('login');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginMsg, setLoginMsg] = useState(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  // Sign-up state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [userType, setUserType] = useState('');
  const [highSchool, setHighSchool] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [targetSatScore, setTargetSatScore] = useState('');
  const [tutorName, setTutorName] = useState('');
  const [teacherCode, setTeacherCode] = useState('');
  const [signupMsg, setSignupMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginMsg(null);
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) return setLoginMsg({ kind: 'danger', text: error.message });

    let dest = '/dashboard';
    if (authData?.user?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle();
      if (profile?.role === 'practice') dest = '/practice';
    }
    window.location.href = dest;
  }

  async function handleForgotPassword() {
    if (!loginEmail) {
      return setLoginMsg({ kind: 'danger', text: 'Please enter your email address first.' });
    }
    setForgotLoading(true);
    setLoginMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    setForgotLoading(false);
    if (error) return setLoginMsg({ kind: 'danger', text: error.message });
    setLoginMsg({ kind: 'ok', text: 'Password reset email sent! Check your inbox.' });
  }

  async function handleSignup(e) {
    e.preventDefault();
    setSignupMsg(null);
    if (password !== confirmPassword) {
      return setSignupMsg({ kind: 'danger', text: 'Passwords do not match.' });
    }
    setLoading(true);

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          userType,
          ...(userType === 'student' && {
            highSchool: highSchool || undefined,
            graduationYear: graduationYear ? Number(graduationYear) : undefined,
            targetSatScore: targetSatScore ? Number(targetSatScore) : undefined,
            tutorName: tutorName || undefined,
          }),
          ...(userType === 'teacher' && { teacherCode }),
        }),
      });

      const data = await res.json();
      if (!res.ok) return setSignupMsg({ kind: 'danger', text: data.error });
      setSignupMsg({ kind: 'ok', text: 'Account created! You can now log in.' });
    } catch {
      setSignupMsg({ kind: 'danger', text: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* Tabs */}
        <div className="landingTabs">
          <button
            className={`landingTab${tab === 'login' ? ' active' : ''}`}
            onClick={() => setTab('login')}
            type="button"
          >
            Log in
          </button>
          <button
            className={`landingTab${tab === 'signup' ? ' active' : ''}`}
            onClick={() => setTab('signup')}
            type="button"
          >
            Sign up
          </button>
        </div>

        {/* ── Log in tab ── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin}>
            <label>Email</label>
            <input className="input" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} type="email" required />
            <label>Password</label>
            <div className="passwordWrap">
              <input className="input" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} type={showLoginPassword ? 'text' : 'password'} required />
              <button
                type="button"
                className="passwordToggle"
                onClick={() => setShowLoginPassword(v => !v)}
                aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
              >
                {showLoginPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
            <div className="forgotLink">
              <button
                type="button"
                className="landingLink"
                onClick={handleForgotPassword}
                disabled={forgotLoading}
              >
                {forgotLoading ? 'Sending…' : 'Forgot password?'}
              </button>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" type="submit">Log in</button>
            </div>
            <Toast kind={loginMsg?.kind} message={loginMsg?.text} />
          </form>
        )}

        {/* ── Sign up tab ── */}
        {tab === 'signup' && (
          <form onSubmit={handleSignup}>
            <label>I am…</label>
            <select
              className="input"
              value={userType}
              onChange={e => setUserType(e.target.value)}
              required
            >
              <option value="" disabled>Select one</option>
              <option value="student">a student</option>
              <option value="teacher">a teacher</option>
              <option value="exploring">just exploring</option>
            </select>

            <div className="row" style={{ gap: 12, marginTop: 0 }}>
              <div style={{ flex: 1 }}>
                <label>First name</label>
                <input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} required />
              </div>
              <div style={{ flex: 1 }}>
                <label>Last name</label>
                <input className="input" value={lastName} onChange={e => setLastName(e.target.value)} required />
              </div>
            </div>

            <label>Email</label>
            <input className="input" value={email} onChange={e => setEmail(e.target.value)} type="email" required />

            <label>Password</label>
            <div className="passwordWrap">
              <input className="input" value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} required />
              <button
                type="button"
                className="passwordToggle"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>

            <label>Confirm password</label>
            <div className="passwordWrap">
              <input className="input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} type={showConfirmPassword ? 'text' : 'password'} required />
              <button
                type="button"
                className="passwordToggle"
                onClick={() => setShowConfirmPassword(v => !v)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>

            {/* Student-specific fields */}
            {userType === 'student' && (
              <>
                <label>High school</label>
                <input className="input" value={highSchool} onChange={e => setHighSchool(e.target.value)} />

                <div className="row" style={{ gap: 12, marginTop: 0 }}>
                  <div style={{ flex: 1 }}>
                    <label>Graduation year</label>
                    <select className="input" value={graduationYear} onChange={e => setGraduationYear(e.target.value)}>
                      <option value="">Select</option>
                      {GRAD_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Target SAT score</label>
                    <input
                      className="input"
                      type="number"
                      min="400"
                      max="1600"
                      step="10"
                      placeholder="e.g. 1400"
                      value={targetSatScore}
                      onChange={e => setTargetSatScore(e.target.value)}
                    />
                  </div>
                </div>

                <label>Studyworks tutor&apos;s name (if any)</label>
                <input className="input" value={tutorName} onChange={e => setTutorName(e.target.value)} placeholder="Optional" />
              </>
            )}

            {/* Teacher-specific fields */}
            {userType === 'teacher' && (
              <>
                <label>Teacher code</label>
                <input
                  className="input"
                  value={teacherCode}
                  onChange={e => setTeacherCode(e.target.value)}
                  required
                  placeholder="Enter the code provided to you"
                />
              </>
            )}

            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn" type="submit" disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </div>
            <Toast kind={signupMsg?.kind} message={signupMsg?.text} />
          </form>
        )}
      </div>
    </main>
  );
}
