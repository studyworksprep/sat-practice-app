'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteResultButton({ attemptId }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const res = await fetch(`/api/practice-tests/attempt/${attemptId}`, { method: 'DELETE' });
    if (res.ok) {
      router.refresh();
    } else {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn"
          style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}
          onClick={handleDelete}
          disabled={loading}
        >
          {loading ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button className="btn secondary" onClick={() => setConfirming(false)} disabled={loading}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      className="btn secondary"
      style={{ color: 'var(--danger)' }}
      onClick={() => setConfirming(true)}
      title="Delete this result"
    >
      Delete
    </button>
  );
}
