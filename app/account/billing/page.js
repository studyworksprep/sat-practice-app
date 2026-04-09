'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function BillingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/billing/status')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function openPortal() {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/create-portal', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to open portal');
      window.location.href = d.url;
    } catch (err) {
      setError(err.message);
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="container" style={{ paddingTop: 48, textAlign: 'center' }}>
        <p className="muted">Loading billing info...</p>
      </main>
    );
  }

  const sub = data?.subscription;
  const reason = data?.reason;

  return (
    <main className="container" style={{ maxWidth: 600, paddingTop: 40, paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 className="h1" style={{ margin: 0 }}>Billing</h1>
        <Link href="/dashboard" className="btn secondary">Dashboard</Link>
      </div>

      <div className="card" style={{ padding: 24 }}>
        {/* Access status */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Account Status</div>
          {data?.hasAccess ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              <span style={{ fontWeight: 700, fontSize: 16, color: '#166534' }}>Active</span>
              {reason === 'exempt' && <span className="pill" style={{ fontSize: 11, background: 'rgba(22,163,74,0.1)', color: '#166534' }}>Exempt</span>}
              {reason === 'role' && <span className="pill" style={{ fontSize: 11, background: 'rgba(79,124,224,0.1)', color: 'var(--accent)' }}>{data.plan || 'Admin'}</span>}
              {reason === 'subscription' && <span className="pill" style={{ fontSize: 11, background: 'rgba(79,124,224,0.1)', color: 'var(--accent)' }}>{sub?.plan || 'Subscribed'}</span>}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
              <span style={{ fontWeight: 700, fontSize: 16, color: '#991b1b' }}>No Active Subscription</span>
            </div>
          )}
        </div>

        {/* Subscription details */}
        {sub && (
          <div style={{ display: 'grid', gap: 12, marginBottom: 20, padding: '16px', background: 'var(--surface)', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span className="muted">Plan</span>
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{sub.plan}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span className="muted">Status</span>
              <span style={{ fontWeight: 600, textTransform: 'capitalize', color: sub.status === 'active' ? '#166534' : sub.status === 'trialing' ? 'var(--accent)' : '#dc2626' }}>
                {sub.status === 'trialing' ? 'Free Trial' : sub.status}
              </span>
            </div>
            {sub.trial_end && sub.status === 'trialing' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span className="muted">Trial Ends</span>
                <span style={{ fontWeight: 600 }}>{new Date(sub.trial_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            )}
            {sub.current_period_end && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span className="muted">{sub.cancel_at_period_end ? 'Access Until' : 'Next Billing Date'}</span>
                <span style={{ fontWeight: 600 }}>{new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            )}
            {sub.cancel_at_period_end && (
              <div style={{ padding: '8px 12px', background: '#fef3c7', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                Your subscription will cancel at the end of the current period.
              </div>
            )}
          </div>
        )}

        {/* Exempt message */}
        {reason === 'exempt' && (
          <div style={{ padding: '16px', background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 10, marginBottom: 20 }}>
            <p style={{ fontSize: 14, color: '#166534', margin: 0, lineHeight: 1.6 }}>
              Your account has full platform access at no cost through Studyworks Prep. No subscription or payment is required.
            </p>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {sub && (
            <button
              className="btn secondary"
              onClick={openPortal}
              disabled={portalLoading}
              style={{ padding: '10px 20px', fontSize: 14 }}
            >
              {portalLoading ? 'Opening...' : 'Manage Subscription'}
            </button>
          )}
          {!data?.hasAccess && (
            <Link href="/subscribe" className="btn primary" style={{ padding: '10px 20px', fontSize: 14 }}>
              Choose a Plan
            </Link>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#fee2e2', borderRadius: 8, fontSize: 13, color: '#991b1b' }}>
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
