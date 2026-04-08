'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function SubscribeContent() {
  const searchParams = useSearchParams();
  const canceled = searchParams.get('checkout') === 'canceled';
  const [loading, setLoading] = useState(null); // 'student' | 'teacher' | null
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null); // from /api/billing/status
  const [checking, setChecking] = useState(true);

  // Check if user already has access
  useEffect(() => {
    fetch('/api/billing/status')
      .then(r => r.json())
      .then(d => {
        setStatus(d);
        // If they already have access, redirect
        if (d.hasAccess) {
          window.location.href = '/dashboard';
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  async function startCheckout(plan) {
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

  if (checking) {
    return (
      <main style={{ maxWidth: 700, margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
        <p className="muted">Checking your account...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: '48px 20px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <img src="/studyworks-logo.png" alt="StudyWorks" style={{ height: 40, marginBottom: 16 }} />
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 8px' }}>Choose Your Plan</h1>
        <p style={{ fontSize: 16, color: 'var(--muted)', maxWidth: 440, margin: '0 auto' }}>
          Start with a 7-day free trial. Cancel anytime.
        </p>
        {canceled && (
          <div style={{ marginTop: 12, padding: '10px 16px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, display: 'inline-block' }}>
            <span style={{ fontSize: 14, color: '#92400e' }}>Checkout was canceled. You can try again when you're ready.</span>
          </div>
        )}
      </div>

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
        {/* Student plan */}
        <div style={{
          padding: '32px 28px', borderRadius: 16, border: '2px solid var(--accent)',
          background: 'var(--card)', textAlign: 'center',
          boxShadow: '0 4px 24px rgba(79,124,224,0.1)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', marginBottom: 8 }}>Student</div>
          <div style={{ fontSize: 44, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>$12.99</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4, marginBottom: 20 }}>per month</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', textAlign: 'left', display: 'grid', gap: 6 }}>
            {['Full question bank', 'Adaptive practice tests', 'Score reports & analytics', 'Smart review & error log', 'Desmos calculator'].map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                <svg viewBox="0 0 20 20" width="16" height="16" style={{ flexShrink: 0 }}><path fill="#22c55e" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"/></svg>
                {item}
              </li>
            ))}
          </ul>
          <button
            className="btn primary"
            onClick={() => startCheckout('student')}
            disabled={!!loading}
            style={{ width: '100%', padding: '12px', fontSize: 15, borderRadius: 10 }}
          >
            {loading === 'student' ? 'Redirecting...' : 'Start Free Trial'}
          </button>
        </div>

        {/* Teacher plan */}
        <div style={{
          padding: '32px 28px', borderRadius: 16, border: '2px solid #7c3aed',
          background: 'var(--card)', textAlign: 'center',
          boxShadow: '0 4px 24px rgba(124,58,237,0.1)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#7c3aed', marginBottom: 8 }}>Teacher</div>
          <div style={{ fontSize: 44, fontWeight: 800, color: '#7c3aed', lineHeight: 1 }}>$29.99</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4, marginBottom: 20 }}>per month</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', textAlign: 'left', display: 'grid', gap: 6 }}>
            {['Everything in Student', 'Student roster & analytics', 'Custom assignments', 'Score tracking & reports', 'Unlimited students'].map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                <svg viewBox="0 0 20 20" width="16" height="16" style={{ flexShrink: 0 }}><path fill="#22c55e" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"/></svg>
                {item}
              </li>
            ))}
          </ul>
          <button
            className="btn primary"
            onClick={() => startCheckout('teacher')}
            disabled={!!loading}
            style={{ width: '100%', padding: '12px', fontSize: 15, borderRadius: 10, background: '#7c3aed', borderColor: '#7c3aed' }}
          >
            {loading === 'teacher' ? 'Redirecting...' : 'Start Free Trial'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ textAlign: 'center', padding: '10px 16px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 20 }}>
          <span style={{ fontSize: 14, color: '#991b1b' }}>{error}</span>
        </div>
      )}

      {/* Free for SP students */}
      <div style={{ textAlign: 'center', padding: '20px 24px', background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 12 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#166534', margin: '0 0 4px' }}>Working with a Studyworks Prep tutor?</p>
        <p style={{ fontSize: 13, color: '#15803d', margin: 0, lineHeight: 1.6 }}>
          Students and teachers with{' '}
          <a href="https://www.studyworksprep.com" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: '#166534' }}>Studyworks Prep</a>{' '}
          get full access at no cost. Sign up with your tutor's invite code to activate free access.
        </p>
      </div>
    </main>
  );
}

export default function SubscribePage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 700, margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}><p className="muted">Loading...</p></main>}>
      <SubscribeContent />
    </Suspense>
  );
}
