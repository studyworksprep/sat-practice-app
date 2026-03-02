'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import HtmlBlock from '../../../../components/HtmlBlock';

const SUBJECT_LABEL = { rw: 'Reading & Writing', math: 'Math' };

function fmtTime(secs) {
  if (secs <= 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function TimerChip({ seconds }) {
  const urgent = seconds !== null && seconds <= 300; // last 5 min
  return (
    <div className={`ptTimer${urgent ? ' ptTimerUrgent' : ''}`}>
      {seconds === null ? '—' : fmtTime(seconds)}
    </div>
  );
}

function QuestionMap({ questions, answers, currentIdx, onJump }) {
  return (
    <div className="ptQMap">
      {questions.map((q, i) => {
        const answered = !!answers[q.question_version_id];
        const active = i === currentIdx;
        return (
          <button
            key={q.question_version_id}
            className={`ptQChip${active ? ' active' : answered ? ' answered' : ''}`}
            onClick={() => onJump(i)}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}

function McqOptions({ options, selected, onChange, disabled }) {
  return (
    <div className="ptOptions">
      {options.map((opt) => (
        <label
          key={opt.id}
          className={`ptOption${selected === opt.id ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
        >
          <input
            type="radio"
            name="mcq"
            value={opt.id}
            checked={selected === opt.id}
            onChange={() => !disabled && onChange(opt.id)}
            disabled={disabled}
          />
          <span className="ptOptionLabel">{opt.label || String.fromCharCode(65 + (opt.ordinal - 1))}</span>
          <HtmlBlock html={opt.content_html} className="ptOptionContent" />
        </label>
      ))}
    </div>
  );
}

export default function TestSessionPage() {
  const { attemptId } = useParams();
  const router = useRouter();

  const [moduleData, setModuleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({}); // { [question_version_id]: { selected_option_id?, response_text? } }
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const timerRef = useRef(null);

  const loadModule = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/practice-tests/attempt/${attemptId}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load'); setLoading(false); return; }
      if (data.status === 'completed') { router.replace(`/practice-test/attempt/${attemptId}/results`); return; }

      setModuleData(data);
      setCurrentIdx(0);

      // Restore saved answers
      const restored = {};
      for (const q of data.questions || []) {
        if (q.saved_answer?.selected_option_id || q.saved_answer?.response_text) {
          restored[q.question_version_id] = {
            selected_option_id: q.saved_answer.selected_option_id || null,
            response_text: q.saved_answer.response_text || null,
          };
        }
      }
      setAnswers(restored);

      // Timer
      if (data.time_limit_seconds) {
        const lsKey = `pt_start_${attemptId}_${data.subject_code}_${data.module_number}`;
        let startTs = localStorage.getItem(lsKey);
        if (!startTs) {
          startTs = Date.now().toString();
          localStorage.setItem(lsKey, startTs);
        }
        const elapsed = Math.floor((Date.now() - parseInt(startTs, 10)) / 1000);
        setTimeRemaining(Math.max(0, data.time_limit_seconds - elapsed));
      } else {
        setTimeRemaining(null);
      }

      setLoading(false);
    } catch {
      setError('Network error — please refresh.');
      setLoading(false);
    }
  }, [attemptId, router]);

  useEffect(() => { loadModule(); }, [loadModule]);

  // Start the countdown once timeRemaining is first set (null → number)
  useEffect(() => {
    if (timeRemaining === null || submitting) return;
    clearInterval(timerRef.current);
    if (timeRemaining <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeRemaining((t) => (t <= 1 ? 0 : t - 1));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [timeRemaining === null, submitting]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (timeRemaining === 0 && !submitting && moduleData) {
      clearInterval(timerRef.current);
      submitModule(true);
    }
  }, [timeRemaining]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitModule(autoSubmit = false) {
    if (submitting || !moduleData) return;
    setSubmitting(true);
    clearInterval(timerRef.current);

    // Clear timer from localStorage
    const lsKey = `pt_start_${attemptId}_${moduleData.subject_code}_${moduleData.module_number}`;
    localStorage.removeItem(lsKey);

    const answerList = (moduleData.questions || []).map((q) => ({
      question_version_id: q.question_version_id,
      question_id: q.question_id,
      ...(answers[q.question_version_id] || {}),
    }));

    try {
      const res = await fetch(`/api/practice-tests/attempt/${attemptId}/submit-module`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_code: moduleData.subject_code,
          module_number: moduleData.module_number,
          route_code: moduleData.route_code,
          answers: answerList,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Submit failed'); setSubmitting(false); return; }

      if (data.is_complete) {
        router.replace(`/practice-test/attempt/${attemptId}/results`);
      } else {
        setSubmitting(false);
        setShowConfirm(false);
        loadModule();
      }
    } catch {
      setError('Network error during submit.');
      setSubmitting(false);
    }
  }

  function setAnswer(versionId, field, value) {
    setAnswers((prev) => ({
      ...prev,
      [versionId]: { ...(prev[versionId] || {}), [field]: value },
    }));
  }

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 48, textAlign: 'center' }}>
        <p className="muted">Loading module…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ paddingTop: 48 }}>
        <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>
          <button className="btn secondary" onClick={loadModule}>Retry</button>
        </div>
      </div>
    );
  }

  const q = moduleData?.questions?.[currentIdx];
  if (!q) return null;

  const ans = answers[q.question_version_id] || {};
  const answeredCount = Object.keys(answers).length;
  const totalCount = moduleData.questions.length;
  const unansweredCount = totalCount - answeredCount;

  const subjectLabel = SUBJECT_LABEL[moduleData.subject_code] || moduleData.subject_code;
  const moduleLabel = `${subjectLabel} — Module ${moduleData.module_number} of 2`;

  return (
    <div className="ptSession">
      {/* Session header */}
      <div className="ptSessionHeader">
        <div className="ptModuleLabel">{moduleLabel}</div>
        <TimerChip seconds={timeRemaining} />
      </div>

      {/* Question panel */}
      <div className="ptQuestionPanel">
        <div className="ptQuestionNum">Question {currentIdx + 1} of {totalCount}</div>

        {q.stimulus_html && (
          <div className="ptStimulus">
            <HtmlBlock html={q.stimulus_html} />
          </div>
        )}

        <div className="ptStem">
          <HtmlBlock html={q.stem_html} />
        </div>

        {q.question_type === 'mcq' || q.options?.length > 0 ? (
          <McqOptions
            options={q.options}
            selected={ans.selected_option_id}
            onChange={(id) => setAnswer(q.question_version_id, 'selected_option_id', id)}
            disabled={submitting}
          />
        ) : (
          <div className="ptSprWrap">
            <input
              className="input"
              type="text"
              placeholder="Your answer"
              value={ans.response_text || ''}
              onChange={(e) => setAnswer(q.question_version_id, 'response_text', e.target.value)}
              disabled={submitting}
            />
          </div>
        )}
      </div>

      {/* Bottom navigation bar */}
      <div className="ptNavBar">
        <QuestionMap
          questions={moduleData.questions}
          answers={answers}
          currentIdx={currentIdx}
          onJump={setCurrentIdx}
        />
        <div className="ptNavButtons">
          <button
            className="btn secondary"
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={currentIdx === 0 || submitting}
          >
            Prev
          </button>
          {currentIdx < totalCount - 1 ? (
            <button
              className="btn secondary"
              onClick={() => setCurrentIdx((i) => Math.min(totalCount - 1, i + 1))}
              disabled={submitting}
            >
              Next
            </button>
          ) : (
            <button
              className="btn"
              onClick={() => setShowConfirm(true)}
              disabled={submitting}
            >
              Submit Module
            </button>
          )}
        </div>
      </div>

      {/* Confirm submit overlay */}
      {showConfirm && (
        <div className="ptOverlay">
          <div className="ptConfirmCard card">
            <div className="h2">Submit Module?</div>
            {unansweredCount > 0 ? (
              <p className="muted" style={{ marginTop: 8 }}>
                You have <strong>{unansweredCount}</strong> unanswered question{unansweredCount !== 1 ? 's' : ''}.
                Unanswered questions will be marked incorrect.
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 8 }}>
                All {totalCount} questions answered. Ready to submit?
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn" onClick={() => submitModule(false)} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
              <button className="btn secondary" onClick={() => setShowConfirm(false)} disabled={submitting}>
                Go back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
