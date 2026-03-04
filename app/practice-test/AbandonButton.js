'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AbandonButton({ attemptId }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function abandon() {
    setLoading(true);
    await fetch(`/api/practice-tests/attempt/${attemptId}/abandon`, { method: 'POST' });
    router.refresh();
  }

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn"
          style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}
          onClick={abandon}
          disabled={loading}
        >
          {loading ? 'Abandoning…' : 'Yes, abandon'}
        </button>
        <button className="btn secondary" onClick={() => setConfirming(false)} disabled={loading}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button className="btn secondary" onClick={() => setConfirming(true)}>
      Abandon
    </button>
  );
}
