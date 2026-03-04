'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabase/browser';

export default function AdminPage() {
  const supabase = createClient();

  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Score conversion dialog state
  const [showScoreDialog, setShowScoreDialog] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [rwM1, setRwM1] = useState('');
  const [rwM2, setRwM2] = useState('');
  const [rwScaled, setRwScaled] = useState('');
  const [mathM1, setMathM1] = useState('');
  const [mathM2, setMathM2] = useState('');
  const [mathScaled, setMathScaled] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    supabase
      .from('practice_tests')
      .select('id, code, name')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setTests(data || []);
        setLoading(false);
      });
  }, []);

  function showToast(kind, message) {
    setToast({ kind, message });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSaveScores() {
    if (!selectedTestId) return showToast('danger', 'Select a test first.');

    const entries = [];
    const test = tests.find((t) => t.id === selectedTestId);

    if (rwM1 !== '' && rwM2 !== '' && rwScaled !== '') {
      entries.push({
        section: 'reading_writing',
        module1_correct: parseInt(rwM1, 10),
        module2_correct: parseInt(rwM2, 10),
        scaled_score: parseInt(rwScaled, 10),
      });
    }
    if (mathM1 !== '' && mathM2 !== '' && mathScaled !== '') {
      entries.push({
        section: 'math',
        module1_correct: parseInt(mathM1, 10),
        module2_correct: parseInt(mathM2, 10),
        scaled_score: parseInt(mathScaled, 10),
      });
    }

    if (entries.length === 0) {
      return showToast('danger', 'Fill in at least one complete section (both modules + scale score).');
    }

    // Validate ranges
    for (const e of entries) {
      if (e.scaled_score < 200 || e.scaled_score > 800) {
        return showToast('danger', 'Scale scores must be between 200 and 800.');
      }
      if (e.module1_correct < 0 || e.module2_correct < 0) {
        return showToast('danger', 'Correct counts cannot be negative.');
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/score-conversion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_id: selectedTestId,
          test_name: test?.name || '',
          entries,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      showToast('ok', `Saved ${data.saved} score conversion(s).`);
      // Clear fields
      setRwM1(''); setRwM2(''); setRwScaled('');
      setMathM1(''); setMathM2(''); setMathScaled('');
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="container">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="container adminMain">
      <h1 className="h1" style={{ marginBottom: 4 }}>Admin</h1>
      <p className="muted small" style={{ marginBottom: 28 }}>
        Manage users, accounts, and score data.
      </p>

      {/* Toast */}
      {toast && (
        <div
          className="toast"
          style={{
            borderColor: toast.kind === 'ok' ? 'rgba(52,211,153,0.5)' : 'rgba(251,113,133,0.6)',
            marginBottom: 16,
          }}
        >
          <span className="small">{toast.message}</span>
        </div>
      )}

      {/* ── Panels row ──────────────────────────────────────── */}
      <div className="adminPanels">
        <div className="card adminPanel">
          <div className="adminPanelIcon">👤</div>
          <div className="adminPanelTitle">Students</div>
          <div className="muted small">Coming soon</div>
        </div>
        <div className="card adminPanel">
          <div className="adminPanelIcon">🎓</div>
          <div className="adminPanelTitle">Teachers</div>
          <div className="muted small">Coming soon</div>
        </div>
        <div className="card adminPanel">
          <div className="adminPanelIcon">📝</div>
          <div className="adminPanelTitle">Practice Accounts</div>
          <div className="muted small">Coming soon</div>
        </div>
      </div>

      {/* ── Score Conversion Entry ──────────────────────────── */}
      <section style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="h2" style={{ margin: 0 }}>Score Conversions</h2>
          <button className="btn" onClick={() => setShowScoreDialog(!showScoreDialog)}>
            {showScoreDialog ? 'Close' : 'Add Score Data'}
          </button>
        </div>

        {showScoreDialog && (
          <div className="card adminScoreDialog">
            {/* Test selector */}
            <label className="adminLabel">
              Practice Test
              <select
                className="adminSelect"
                value={selectedTestId}
                onChange={(e) => setSelectedTestId(e.target.value)}
              >
                <option value="">Select a test…</option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>

            {/* Reading & Writing */}
            <fieldset className="adminFieldset">
              <legend className="adminLegend">Reading & Writing</legend>
              <div className="adminFieldRow">
                <label className="adminLabel adminFieldSmall">
                  Module 1 Correct
                  <input
                    type="number" min="0" className="adminInput"
                    value={rwM1} onChange={(e) => setRwM1(e.target.value)}
                  />
                </label>
                <label className="adminLabel adminFieldSmall">
                  Module 2 Correct
                  <input
                    type="number" min="0" className="adminInput"
                    value={rwM2} onChange={(e) => setRwM2(e.target.value)}
                  />
                </label>
                <label className="adminLabel adminFieldSmall">
                  Scale Score
                  <input
                    type="number" min="200" max="800" className="adminInput"
                    value={rwScaled} onChange={(e) => setRwScaled(e.target.value)}
                  />
                </label>
              </div>
            </fieldset>

            {/* Math */}
            <fieldset className="adminFieldset">
              <legend className="adminLegend">Math</legend>
              <div className="adminFieldRow">
                <label className="adminLabel adminFieldSmall">
                  Module 1 Correct
                  <input
                    type="number" min="0" className="adminInput"
                    value={mathM1} onChange={(e) => setMathM1(e.target.value)}
                  />
                </label>
                <label className="adminLabel adminFieldSmall">
                  Module 2 Correct
                  <input
                    type="number" min="0" className="adminInput"
                    value={mathM2} onChange={(e) => setMathM2(e.target.value)}
                  />
                </label>
                <label className="adminLabel adminFieldSmall">
                  Scale Score
                  <input
                    type="number" min="200" max="800" className="adminInput"
                    value={mathScaled} onChange={(e) => setMathScaled(e.target.value)}
                  />
                </label>
              </div>
            </fieldset>

            <button className="btn" onClick={handleSaveScores} disabled={saving} style={{ marginTop: 8 }}>
              {saving ? 'Saving…' : 'Save Score Data'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
