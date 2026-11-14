// Plan picker UI + checkout-redirect handler. Visual companion to
// the marketing-landing auth card (Home.module.css .authCard) —
// same tokens, same shadow, same border radius, so a user coming
// from signup → trial sees one continuous tone.
//
// The checkout API is /api/billing/create-checkout (legacy route,
// unchanged) — POST { plan } returns { url }. Anonymous users can
// reach this page; the API will reject without a session, so we
// gate the buttons on `signedIn` and prompt anonymous users to
// log in first.

'use client';

import { useState } from 'react';
import s from './Subscribe.module.css';

const PLANS = [
  {
    plan: 'student',
    label: 'Student',
    accentClass: '',
    features: [
      'SAT & ACT question banks',
      'Full-length SAT & ACT practice tests',
      'Short lessons with practice',
      'Score reports & mastery tracking',
      'Review drills & error log',
      'Desmos calculator',
    ],
  },
  {
    plan: 'teacher',
    label: 'Teacher',
    accentClass: 'teacher',
    features: [
      'Everything in Student',
      'Student roster & progress',
      'Custom assignments',
      'Score tracking & reports',
      'Invite as many students as you like (each has their own plan)',
    ],
  },
];

export function SubscribeClient({ canceled, signedIn, studentPrice, teacherPrice, onlyPlan = null }) {
  // A signed-in account is offered only the plan its role may buy
  // (planForRole); checkout enforces the same rule server-side.
  const plans = onlyPlan ? PLANS.filter((p) => p.plan === onlyPlan) : PLANS;
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);

  async function startCheckout(plan) {
    if (!signedIn) {
      window.location.href = `/login?next=${encodeURIComponent('/subscribe')}`;
      return;
    }
    setLoading(plan);
    setError(null);
    try {
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create checkout');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setLoading(null);
    }
  }

  return (
    <main className={s.page}>
      <header className={s.header}>
        <img src="/studyworks-logo.png" alt="Studyworks" className={s.logo} />
        <h1 className={s.h1}>{onlyPlan ? 'Start your free trial' : 'Choose your plan'}</h1>
        <p className={s.sub}>Start with a 7-day free trial. Cancel anytime.</p>
        {canceled && (
          <div className={s.canceledBanner}>
            Checkout was canceled. You can try again when you&rsquo;re ready.
          </div>
        )}
      </header>

      <section className={plans.length === 1 ? `${s.plans} ${s.plansSingle}` : s.plans}>
        {plans.map((p) => (
          <div
            key={p.plan}
            className={p.accentClass === 'teacher' ? `${s.planCard} ${s.planCardTeacher}` : s.planCard}
          >
            <div className={s.planEyebrow}>{p.label}</div>
            <div className={s.planPrice}>{p.plan === 'student' ? studentPrice : teacherPrice}</div>
            <div className={s.planCadence}>per month</div>
            <ul className={s.planFeatures}>
              {p.features.map((f) => (
                <li key={f} className={s.planFeatureItem}>
                  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                    <path
                      fill="#22c55e"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
                    />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={p.accentClass === 'teacher' ? `${s.planCta} ${s.planCtaTeacher}` : s.planCta}
              onClick={() => startCheckout(p.plan)}
              disabled={!!loading}
            >
              {loading === p.plan
                ? 'Redirecting…'
                : signedIn
                  ? 'Start Free Trial'
                  : 'Log in to start'}
            </button>
          </div>
        ))}
      </section>

      {error && (
        <div className={s.errorBanner}>{error}</div>
      )}

      <section className={s.exempt}>
        <p className={s.exemptTitle}>Working with a Studyworks Prep tutor?</p>
        <p className={s.exemptBody}>
          Students and teachers with{' '}
          <a
            className={s.exemptLink}
            href="https://www.studyworksprep.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Studyworks Prep
          </a>{' '}
          can get full access at no cost. Studyworks sends sponsored students a personal
          invitation code to use when they sign up.
        </p>
      </section>
    </main>
  );
}
