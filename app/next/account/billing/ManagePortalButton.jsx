// Stripe customer-portal redirect. POSTs to /api/billing/create-portal
// and follows the returned URL. Tiny client island; the rest of the
// billing page renders server-side.

'use client';

import { useState } from 'react';
import { Button } from '@/lib/ui/Button';
import s from './Billing.module.css';

export function ManagePortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/create-portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to open portal');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={openPortal} disabled={loading}>
        {loading ? 'Opening…' : 'Manage subscription'}
      </Button>
      {error && <div className={s.errorBanner}>{error}</div>}
    </>
  );
}
