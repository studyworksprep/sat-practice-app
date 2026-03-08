'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabase/browser';
import Toast from './Toast';

const CURRENT_YEAR = new Date().getFullYear();
const GRAD_YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR + i);

export default function LandingClient() {
  const supabase = createClient();
  const [tab, setTab] = useState('login');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginMsg, setLoginMsg] = useState(null);

  // Sign-up state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  function switchTab(t) {
    setTab(t);
    setLoginMsg(null);
    setSignupMsg(null);
  }

  async function onLogin(e) {
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

  async function onSignup(e) {
    e.preventDefault();
    setSignupMsg(null);
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
    <main className="landingMain">
      <div className="landingWrap">

        {/* Branding + intro */}
        <div className="landingHero">
          <img src="/studyworks-logo.png" alt="StudyWorks" className="landingLogo" />
          <h1 className="landingTitle">Master the SAT</h1>
          <p className="landingSubtitle">
            StudyWorks gives you targeted, adaptive SAT practice across every domain and skill.
            Track your progress question by question, pinpoint your weak spots, and build the
            confidence you need on test day.
          </p>
          <ul className="landingFeatures">
            <li>Hundreds of real SAT-style questions across Math and Reading &amp; Writing</li>
            <li>Instant feedback with detailed explanations</li>
            <li>Performance tracking by domain and topic</li>
            <li>Practice tests to simulate the full exam experience</li>
          </ul>
        </div>

        {/* Auth card */}
        <div className="landingCard">
          <div className="landingTabs">
            <button
              className={`landingTab${tab === 'login' ? ' active' : ''}`}
              onClick={() => switchTab('login')}
              type="button"
            >
              Log in
            </button>
            <button
              className={`landingTab${tab === 'signup' ? ' active' : ''}`}
              onClick={() => switchTab('signup')}
              type="button"
            >
              Sign up
            </button>
          </div>

          {tab === 'login' ? (
            <form onSubmit={onLogin} className="landingForm">
              <label>Email</label>
              <input
                className="input"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
              />
              <label>Password</label>
              <input
                className="input"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
              <button className="btn landingSubmit" type="submit">Log in</button>
              <Toast kind={loginMsg?.kind} message={loginMsg?.text} />
              <p className="landingSwitch">
                Don&rsquo;t have an account?{' '}
                <button type="button" className="landingLink" onClick={() => switchTab('signup')}>
                  Sign up free
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={onSignup} className="landingForm">
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
              <input
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
              />

              <label>Password</label>
              <input
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                required
              />
              <p className="muted small" style={{ marginTop: 4 }}>
                Use a strong password of at least 8 characters.
              </p>

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

              <button className="btn landingSubmit" type="submit" disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
              <Toast kind={signupMsg?.kind} message={signupMsg?.text} />
              <p className="landingSwitch">
                Already have an account?{' '}
                <button type="button" className="landingLink" onClick={() => switchTab('login')}>
                  Log in
                </button>
              </p>
            </form>
          )}
        </div>

      </div>
    </main>
  );
}
