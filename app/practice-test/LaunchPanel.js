'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TIME_OPTIONS = [
  { value: '1',   label: 'Standard (no extra time)' },
  { value: '1.5', label: 'Extended Time (1.5×)' },
  { value: '2',   label: 'Extended Time (2×)' },
];

export default function LaunchPanel({ tests }) {
  const router = useRouter();
  const [testId, setTestId] = useState(tests[0]?.id ?? '');
  const [factor, setFactor] = useState('1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function launch() {
    if (!testId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/practice-tests/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ practice_test_id: testId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to start test'); setLoading(false); return; }
      if (factor !== '1') {
        localStorage.setItem(`pt_factor_${data.attempt_id}`, factor);
      }
      router.push(`/practice-test/attempt/${data.attempt_id}`);
    } catch {
      setError('Network error');
      setLoading(false);
    }
  }

  return (
    <div className="card ptLaunchPanel">
      <div className="ptLaunchTitle">Start a New Test</div>

      <div className="ptLaunchFields">
        <div className="ptLaunchField">
          <label className="ptLaunchLabel" htmlFor="pt-select">Test</label>
          <select
            id="pt-select"
            className="ptLaunchSelect"
            value={testId}
            onChange={(e) => setTestId(e.target.value)}
            disabled={loading}
          >
            {tests.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="ptLaunchField">
          <label className="ptLaunchLabel" htmlFor="pt-time">Accommodations</label>
          <select
            id="pt-time"
            className="ptLaunchSelect"
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
            disabled={loading}
          >
            {TIME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="ptLaunchFooter">
        {error && <span className="ptLaunchError">{error}</span>}
        <button className="btn ptLaunchBtn" onClick={launch} disabled={loading || !testId}>
          {loading ? 'Launching…' : 'Launch Test →'}
        </button>
      </div>
    </div>
  );
}
