'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StartTestButton({ practiceTestId, label = 'Start New Test' }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/practice-tests/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ practice_test_id: practiceTestId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to start test'); setLoading(false); return; }
      router.push(`/practice-test/attempt/${data.attempt_id}`);
    } catch {
      setError('Network error');
      setLoading(false);
    }
  }

  return (
    <div>
      <button className="btn" onClick={start} disabled={loading}>
        {loading ? 'Starting…' : label}
      </button>
      {error && <p className="muted small" style={{ marginTop: 4, color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
