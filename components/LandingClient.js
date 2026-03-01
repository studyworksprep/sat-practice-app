'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabase/browser';
import Toast from './Toast';

export default function LandingClient() {
  const supabase = createClient();
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);

  function switchTab(t) {
    setTab(t);
    setMsg(null);
    setEmail('');
    setPassword('');
  }

  async function onLogin(e) {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMsg({ kind: 'danger', text: error.message });
    window.location.href = '/dashboard';
  }

  async function onSignup(e) {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return setMsg({ kind: 'danger', text: error.message });
    setMsg({ kind: 'ok', text: 'Account created. Check your email to confirm, then log in.' });
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
            >
              Log in
            </button>
            <button
              className={`landingTab${tab === 'signup' ? ' active' : ''}`}
              onClick={() => switchTab('signup')}
            >
              Sign up
            </button>
          </div>

          {tab === 'login' ? (
            <form onSubmit={onLogin} className="landingForm">
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
                autoComplete="current-password"
                required
              />
              <button className="btn landingSubmit" type="submit">Log in</button>
              <Toast kind={msg?.kind} message={msg?.text} />
              <p className="landingSwitch">
                Don&rsquo;t have an account?{' '}
                <button type="button" className="landingLink" onClick={() => switchTab('signup')}>
                  Sign up free
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={onSignup} className="landingForm">
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
              <button className="btn landingSubmit" type="submit">Create account</button>
              <Toast kind={msg?.kind} message={msg?.text} />
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
