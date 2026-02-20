'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import HtmlBlock from '../../../components/HtmlBlock';
import Toast from '../../../components/Toast';

function msToNice(ms) {
  if (!ms && ms !== 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

export default function QuestionPage({ params }) {
  const questionId = params.questionId;
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [startTs, setStartTs] = useState(Date.now());
  const [showRationale, setShowRationale] = useState(false);

  async function load({ resetUI = true } = {}) {
    // Only clear messages / reset selection when we're loading a *new* question
    if (resetUI) {
      setMsg(null);
      setSelected(null);
      setShowRationale(false);
      setStartTs(Date.now());
    }
  
    const res = await fetch('/api/questions/' + questionId);
    const json = await res.json();
    if (!res.ok) {
      setMsg({ kind: 'danger', text: json?.error || 'Failed to load question' });
      return;
    }
    setData(json);
  }
  useEffect(() => { load({ resetUI: true }); }, [questionId]);

  async function submitAttempt() {
    if (!selected) return setMsg({ kind: 'danger', text: 'Select an answer choice first.' });
    setSubmitting(true);
    setMsg(null);
    const time_spent_ms = Date.now() - startTs;

    try {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: questionId, selected_option_id: selected, time_spent_ms }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Submit failed');
      setMsg({ kind: json.is_correct ? 'ok' : 'danger', text: json.is_correct ? 'Correct ✅' : 'Incorrect ❌' });
      setShowRationale(true);
      // refresh status fields, but keep the UI (don’t clear msg/selection)
      await load({ resetUI: false });
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleMarked() {
    setMsg(null);
    const res = await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id: questionId, patch: { marked_for_review: !data?.status?.marked_for_review } }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg({ kind: 'danger', text: json?.error || 'Failed to update status' });
    await load();
  }

  async function saveNotes(notes) {
    const res = await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id: questionId, patch: { notes } }),
    });
    const json = await res.json();
    if (!res.ok) setMsg({ kind: 'danger', text: json?.error || 'Failed to save notes' });
  }

  if (!data) {
    return (
      <main className="container">
        <div className="card">Loading…</div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/practice" className="pill">← Back to results</Link>
        <div className="row">
          <span className="pill">Attempts: <span className="kbd">{data?.status?.attempts_count ?? 0}</span></span>
          <span className="pill">Correct: <span className="kbd">{data?.status?.correct_attempts_count ?? 0}</span></span>
          <button className="btn secondary" onClick={toggleMarked}>
            {data?.status?.marked_for_review ? 'Unmark' : 'Mark for review'}
          </button>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div className="h2" style={{ marginBottom: 6 }}>
              {data.taxonomy?.domain_name || data.taxonomy?.domain_code || 'Domain'}
              <span className="muted"> · </span>
              <span className="muted">{data.taxonomy?.skill_name || data.taxonomy?.skill_code || 'Skill'}</span>
            </div>
            <div className="row">
              <span className="pill">Difficulty <span className="kbd">{data.taxonomy?.difficulty ?? '—'}</span></span>
              <span className="pill">Score band <span className="kbd">{data.taxonomy?.score_band ?? '—'}</span></span>
            </div>
          </div>
          <div className="muted small">Time: {msToNice(Date.now() - startTs)}</div>
        </div>

        <hr />

        {data.version?.stimulus_html ? (
          <>
            <div className="h2">Stimulus</div>
            <HtmlBlock html={data.version?.stimulus_html} />
            <hr />
          </>
        ) : null}

        <div className="h2">Question</div>
        <HtmlBlock html={data.version?.stem_html} />

        <hr />

        <div className="h2">Answer choices</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {data.options?.map((opt) => (
            <div
              key={opt.id}
              className={'option' + (selected === opt.id ? ' selected' : '')}
              onClick={() => setSelected(opt.id)}
              role="button"
              tabIndex={0}
            >
              <div className="pill" style={{ minWidth: 54, justifyContent: 'center' }}>{opt.label || String.fromCharCode(65 + (opt.ordinal ?? 0))}</div>
              <div style={{ flex: 1 }}>
                <HtmlBlock html={opt.content_html} />
              </div>
            </div>
          ))}
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" disabled={submitting} onClick={submitAttempt}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
          <button className="btn secondary" onClick={() => load()}>Reload</button>
        </div>

        <Toast kind={msg?.kind} message={msg?.text} />

        {showRationale && data.version?.rationale_html ? (
          <>
            <hr />
            <div className="h2">Explanation</div>
            <HtmlBlock html={data.version?.rationale_html} />
          </>
        ) : null}

        <hr />
        <div className="h2">Notes</div>
        <textarea
          className="input"
          rows={4}
          defaultValue={data.status?.notes || ''}
          placeholder="Add notes for this question…"
          onBlur={(e) => saveNotes(e.target.value)}
        />
        <p className="muted small" style={{ marginTop: 8 }}>
          Notes auto-save when you click outside the textbox.
        </p>
      </div>
    </main>
  );
}
