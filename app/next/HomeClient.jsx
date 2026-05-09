// Marketing landing page client island for the new tree.
// Mirrors the legacy LandingClient (login + signup tabs, role
// links, forgot-password) but rebuilt against the new-tree
// design tokens. Loaded by app/next/page.js for unauthenticated
// visitors — logged-in users are redirected upstream.
//
// Why a single page (vs. separate /login + /signup): the
// legacy app already shipped the unified pattern and users
// learned it. Splitting now would create a regression in
// muscle memory for no design payoff.

'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import s from './Home.module.css';

const CURRENT_YEAR = new Date().getFullYear();
const GRAD_YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR + i);

export function HomeClient({ emailConfirmed }) {
  const supabase = createClient();
  const [tab, setTab] = useState('login');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginMsg, setLoginMsg] = useState(null);
  const [forgotLoading, setForgotLoading] = useState(false);

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
    if (error) {
      setLoginMsg({ kind: 'err', text: error.message });
      return;
    }

    let dest = '/dashboard';
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
    // Hard nav so the proxy re-resolves the user's tree on the
    // landing page; the legacy NavBar was hidden via the
    // x-ui-tree header on this request, but the destination
    // page lives on the next tree and needs a fresh request.
    window.location.href = dest;
  }

  async function handleForgotPassword() {
    if (!loginEmail) {
      setLoginMsg({ kind: 'err', text: 'Please enter your email address first.' });
      return;
    }
    setForgotLoading(true);
    setLoginMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    });
    setForgotLoading(false);
    if (error) {
      setLoginMsg({ kind: 'err', text: error.message });
      return;
    }
    setLoginMsg({ kind: 'ok', text: 'Password reset email sent! Check your inbox.' });
  }

  const willNeedSubscription = userType === 'student' && !teacherCode?.trim();
  const isExploringType = userType === 'exploring';

  async function onSignup(e) {
    e.preventDefault();
    setSignupMsg(null);
    if (password !== confirmPassword) {
      setSignupMsg({ kind: 'err', text: 'Passwords do not match.' });
      return;
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
            teacherCode: teacherCode || undefined,
          }),
          ...(userType === 'teacher' && { teacherCode }),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSignupMsg({ kind: 'err', text: data.error });
        return;
      }
      setSignupMsg({
        kind: 'ok',
        text: 'Check your email to verify your account. Once confirmed, you can log in.',
      });
    } catch {
      setSignupMsg({ kind: 'err', text: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={s.page}>
      <header className={s.topBar}>
        <Wordmark className={s.topBarLogo} />
        <div className={s.topBarRight}>
          <a className={s.topBarLink} href="https://www.studyworksprep.com" target="_blank" rel="noopener noreferrer">
            About Studyworks
          </a>
        </div>
      </header>

      <div className={s.main}>
        <section>
          <span className={s.eyebrow}>
            <span className={s.eyebrowDot} aria-hidden="true" />
            Built for SAT mastery
          </span>
          <h1 className={s.headline}>
            Targeted practice that <span className={s.headlineAccent}>moves your score</span>.
          </h1>
          <p className={s.subhead}>
            Studyworks gives you adaptive practice across every SAT domain and skill.
            Track your progress question by question, pinpoint your weak spots, and
            walk into test day with confidence.
          </p>
          <p className={s.byline}>
            Created by the test prep experts at{' '}
            <a className={s.bylineLink} href="https://www.studyworksprep.com" target="_blank" rel="noopener noreferrer">
              Studyworks Prep
            </a>
            . The same data-driven process we run with every tutoring student.
          </p>

          <div className={s.roleGrid}>
            <RoleCard
              href="/features/students"
              icon="student"
              title="I’m a Student"
              sub="See how Studyworks helps you score higher"
            />
            <RoleCard
              href="/features/teachers"
              icon="teacher"
              title="I’m a Teacher"
              sub="Explore the tools that give you an edge"
            />
            <RoleCard
              href="/features/tutor-managers"
              icon="manager"
              title="I’m a Tutor Manager"
              sub="Run a tutoring team with real-time visibility"
            />
          </div>
        </section>

        <section className={s.authCard}>
          {emailConfirmed === true && (
            <div className={`${s.banner} ${s.bannerOk}`}>
              <span className={s.bannerOkTitle}>Email confirmed!</span>
              Your account is verified. You can now log in below.
            </div>
          )}
          {emailConfirmed === 'error' && (
            <div className={`${s.banner} ${s.bannerErr}`}>
              Email confirmation failed. The link may have expired. Try logging in or request a new one.
            </div>
          )}

          <div className={s.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'login'}
              className={tab === 'login' ? `${s.tab} ${s.tabActive}` : s.tab}
              onClick={() => switchTab('login')}
            >
              Log in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'signup'}
              className={tab === 'signup' ? `${s.tab} ${s.tabActive}` : s.tab}
              onClick={() => switchTab('signup')}
            >
              Sign up
            </button>
          </div>

          {tab === 'login' ? (
            <form onSubmit={onLogin} className={s.form}>
              <div className={s.field}>
                <label className={s.label}>Email</label>
                <input
                  className={s.input}
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <div className={s.field}>
                <label className={s.label}>Password</label>
                <div className={s.passwordWrap}>
                  <input
                    className={s.input}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    type={showLoginPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                  />
                  <PasswordToggle
                    shown={showLoginPassword}
                    onToggle={() => setShowLoginPassword((v) => !v)}
                  />
                </div>
              </div>
              <div className={s.forgotRow}>
                <button
                  type="button"
                  className={s.linkBtn}
                  onClick={handleForgotPassword}
                  disabled={forgotLoading}
                >
                  {forgotLoading ? 'Sending…' : 'Forgot password?'}
                </button>
              </div>
              <button className={s.submit} type="submit">Log in</button>
              {loginMsg && <FormMessage kind={loginMsg.kind} text={loginMsg.text} />}
              <p className={s.switch}>
                Don’t have an account?{' '}
                <button type="button" className={s.linkBtn} onClick={() => switchTab('signup')}>
                  Sign up
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={onSignup} className={s.form}>
              <div className={s.field}>
                <label className={s.label}>I am…</label>
                <select
                  className={s.input}
                  value={userType}
                  onChange={(e) => setUserType(e.target.value)}
                  required
                >
                  <option value="" disabled>Select one</option>
                  <option value="student">a student</option>
                  <option value="teacher">a teacher</option>
                  <option value="exploring">just exploring</option>
                </select>
              </div>

              <div className={s.fieldRow}>
                <div className={s.field}>
                  <label className={s.label}>First name</label>
                  <input
                    className={s.input}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Last name</label>
                  <input
                    className={s.input}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className={s.field}>
                <label className={s.label}>Email</label>
                <input
                  className={s.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>

              <div className={s.field}>
                <label className={s.label}>Password</label>
                <div className={s.passwordWrap}>
                  <input
                    className={s.input}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                  />
                  <PasswordToggle
                    shown={showPassword}
                    onToggle={() => setShowPassword((v) => !v)}
                  />
                </div>
                <p className={s.helpText}>Use a strong password of at least 8 characters.</p>
              </div>

              <div className={s.field}>
                <label className={s.label}>Confirm password</label>
                <div className={s.passwordWrap}>
                  <input
                    className={s.input}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                  />
                  <PasswordToggle
                    shown={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((v) => !v)}
                  />
                </div>
              </div>

              {userType === 'student' && (
                <>
                  <div className={s.field}>
                    <label className={s.label}>High school</label>
                    <input
                      className={s.input}
                      value={highSchool}
                      onChange={(e) => setHighSchool(e.target.value)}
                    />
                  </div>
                  <div className={s.fieldRow}>
                    <div className={s.field}>
                      <label className={s.label}>Graduation year</label>
                      <select
                        className={s.input}
                        value={graduationYear}
                        onChange={(e) => setGraduationYear(e.target.value)}
                      >
                        <option value="">Select</option>
                        {GRAD_YEARS.map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <div className={s.field}>
                      <label className={s.label}>Target SAT score</label>
                      <input
                        className={s.input}
                        type="number"
                        min="400"
                        max="1600"
                        step="10"
                        placeholder="e.g. 1400"
                        value={targetSatScore}
                        onChange={(e) => setTargetSatScore(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className={s.field}>
                    <label className={s.label}>Teacher code (if provided by your teacher)</label>
                    <input
                      className={s.input}
                      value={teacherCode}
                      onChange={(e) => setTeacherCode(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </>
              )}

              {userType === 'teacher' && (
                <div className={s.field}>
                  <label className={s.label}>Teacher code</label>
                  <input
                    className={s.input}
                    value={teacherCode}
                    onChange={(e) => setTeacherCode(e.target.value)}
                    required
                    placeholder="Enter the code provided to you"
                  />
                </div>
              )}

              {willNeedSubscription && !isExploringType && (
                <div className={s.trialNote}>
                  <span className={s.trialNoteEmph}>7-day free trial</span> — full access to the question bank,
                  practice tests, and analytics. After your trial it’s $12.99/month. Cancel anytime.
                  Have a teacher code? Enter it above for free access.
                </div>
              )}

              <button className={s.submit} type="submit" disabled={loading}>
                {loading
                  ? 'Creating account…'
                  : willNeedSubscription
                    ? 'Start 7-Day Free Trial'
                    : 'Create account'}
              </button>
              {signupMsg && <FormMessage kind={signupMsg.kind} text={signupMsg.text} />}
              <p className={s.switch}>
                Already have an account?{' '}
                <button type="button" className={s.linkBtn} onClick={() => switchTab('login')}>
                  Log in
                </button>
              </p>
            </form>
          )}
        </section>
      </div>

      <footer className={s.footer}>
        <p className={s.footerTop}>
          Students working with{' '}
          <a className={s.footerLink} href="https://www.studyworksprep.com" target="_blank" rel="noopener noreferrer">
            Studyworks Prep
          </a>{' '}
          tutors get full access at no cost.
        </p>
        <p className={s.footerSub}>
          Looking for a plan for your school or organization?{' '}
          <a className={s.footerLink} href="mailto:contact@studyworksprep.com?subject=Studyworks Organization Plan Inquiry">
            Contact us
          </a>{' '}
          to discuss a customized solution.
        </p>
      </footer>
    </div>
  );
}

function FormMessage({ kind, text }) {
  if (!text) return null;
  return (
    <div className={`${s.banner} ${kind === 'ok' ? s.bannerOk : s.bannerErr}`} style={{ marginTop: 4, marginBottom: 0 }}>
      {text}
    </div>
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

function RoleCard({ href, icon, title, sub }) {
  const iconClass =
    icon === 'student' ? s.roleIconStudent
    : icon === 'teacher' ? s.roleIconTeacher
    : s.roleIconManager;
  return (
    <a className={s.roleCard} href={href}>
      <span className={`${s.roleIcon} ${iconClass}`}>
        <RoleIcon kind={icon} />
      </span>
      <span className={s.roleBody}>
        <span className={s.roleTitle}>{title}</span>
        <span className={s.roleSub}>{sub}</span>
      </span>
      <svg className={s.roleArrow} viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M7.3 14.7a1 1 0 010-1.4L10.6 10 7.3 6.7a1 1 0 011.4-1.4l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4 0z" />
      </svg>
    </a>
  );
}

function RoleIcon({ kind }) {
  if (kind === 'student') {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    );
  }
  if (kind === 'teacher') {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path fill="currentColor" d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3 1 9l11 6 9-4.91V17h2V9L12 3z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}

// Same wordmark as AppNav.jsx — reproduced here so the marketing
// surface and the in-app top bar render identically. If the brand
// asset changes, update both. Inlining over an <img> keeps the
// hero crisp at any density and avoids a network round-trip.
function Wordmark({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 729 174"
      width={130}
      height={32}
      role="img"
      aria-label="Studyworks"
      className={className}
    >
      <g transform="translate(68, 94)">
        <g fill="#102a43">
          <g>
            <rect x="-8" y="-66" width="16" height="16" rx="2.5" />
            <rect x="-8" y="50" width="16" height="16" rx="2.5" />
            <rect x="-66" y="-8" width="16" height="16" rx="2.5" />
            <rect x="50" y="-8" width="16" height="16" rx="2.5" />
          </g>
          <g transform="rotate(45)">
            <rect x="-8" y="-66" width="16" height="16" rx="2.5" />
            <rect x="-8" y="50" width="16" height="16" rx="2.5" />
            <rect x="-66" y="-8" width="16" height="16" rx="2.5" />
            <rect x="50" y="-8" width="16" height="16" rx="2.5" />
          </g>
          <circle r="50" />
        </g>
        <circle r="16" fill="#ffffff" />
      </g>
      <g transform="translate(124, 36) rotate(22)">
        <g fill="#bf8700">
          <g>
            <rect x="-5" y="-38" width="10" height="10" rx="1.8" />
            <rect x="-5" y="28" width="10" height="10" rx="1.8" />
            <rect x="-38" y="-5" width="10" height="10" rx="1.8" />
            <rect x="28" y="-5" width="10" height="10" rx="1.8" />
          </g>
          <g transform="rotate(45)">
            <rect x="-5" y="-38" width="10" height="10" rx="1.8" />
            <rect x="-5" y="28" width="10" height="10" rx="1.8" />
            <rect x="-38" y="-5" width="10" height="10" rx="1.8" />
            <rect x="28" y="-5" width="10" height="10" rx="1.8" />
          </g>
          <circle r="28" />
        </g>
        <circle r="9" fill="#ffffff" />
      </g>
      <text
        x="170"
        y="124"
        fontFamily="'Playfair Display', Georgia, serif"
        fontWeight="700"
        fontSize="86"
        letterSpacing="-1.3"
        fill="#102a43"
      >
        Study<tspan fill="#bf8700">works</tspan>
      </text>
    </svg>
  );
}
