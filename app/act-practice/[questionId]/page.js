'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Toast from '../../../components/Toast';
import HtmlBlock from '../../../components/HtmlBlock';
import { useTestType } from '../../../lib/TestTypeContext';

const htmlHasContent = (html) => {
  if (!html) return false;
  if (/<img\s/i.test(html)) return true;
  const text = html.replace(/<[^>]+>/g, '').trim();
  return text.length > 0 && text !== 'NULL';
};

const SECTION_LABELS = { english: 'English', math: 'Math', reading: 'Reading', science: 'Science' };
const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

export default function ActQuestionDetailPage() {
  const { questionId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { testType } = useTestType();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [gotCorrect, setGotCorrect] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [wrongOptionIds, setWrongOptionIds] = useState([]);
  const [showRationale, setShowRationale] = useState(false);
  const startedAtRef = useRef(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef(null);

  // Session nav params
  const sid = searchParams.get('sid');
  const totalFromUrl = parseInt(searchParams.get('t') || '0', 10);
  const indexFromUrl = parseInt(searchParams.get('i') || '0', 10);

  // Redirect to SAT practice if user switches
  useEffect(() => {
    if (testType === 'sat') router.replace('/practice');
  }, [testType, router]);

  // Fetch question
  useEffect(() => {
    if (!questionId) return;
    setLoading(true);
    setMsg(null);
    setSelected(null);
    setGotCorrect(false);
    setGaveUp(false);
    setWrongOptionIds([]);
    setShowRationale(false);
    startedAtRef.current = Date.now();
    setElapsedMs(0);

    fetch(`/api/act/questions/${questionId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setData(json);

        // If previously answered, restore state
        if (json.status?.is_done) {
          setGotCorrect(json.status.last_is_correct);
          if (json.status.last_selected_option_id) setSelected(json.status.last_selected_option_id);
        }
      })
      .catch(e => setMsg({ kind: 'danger', text: e.message }))
      .finally(() => setLoading(false));
  }, [questionId]);

  // Timer
  useEffect(() => {
    if (!questionId) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [questionId]);

  useEffect(() => {
    if ((gotCorrect || gaveUp) && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [gotCorrect, gaveUp]);

  // Session navigation
  function getSessionIds() {
    if (!sid) return null;
    const raw = localStorage.getItem(`act_session_${sid}`);
    return raw ? raw.split(',') : null;
  }

  function navigateTo(targetId, targetIndex) {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set('i', String(targetIndex));
    router.push(`/act-practice/${encodeURIComponent(targetId)}?${qs.toString()}`);
  }

  const sessionIds = getSessionIds();
  const currentIdx = sessionIds ? sessionIds.indexOf(questionId) : -1;
  const hasPrev = currentIdx > 0;
  const hasNext = sessionIds && currentIdx >= 0 && currentIdx < sessionIds.length - 1;

  function goPrev() {
    if (!hasPrev) return;
    navigateTo(sessionIds[currentIdx - 1], indexFromUrl - 1);
  }
  function goNext() {
    if (!hasNext) return;
    navigateTo(sessionIds[currentIdx + 1], indexFromUrl + 1);
  }

  // Submit answer
  async function handleSubmit() {
    if (!selected || !data?.question_id) return;

    // Retry on wrong: track wrong choice and let student try again
    if (data.status?.is_done || wrongOptionIds.length > 0) {
      // Already answered — check if the retry is correct
      const correctId = data.correct_option_id;
      if (correctId && String(selected) === String(correctId)) {
        setGotCorrect(true);
      } else {
        setWrongOptionIds(prev => prev.includes(selected) ? prev : [...prev, selected]);
      }
      return;
    }

    setSubmitting(true);
    const time_spent_ms = Math.max(0, Date.now() - startedAtRef.current);

    try {
      const res = await fetch('/api/act/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: data.question_id,
          selected_option_id: selected,
          time_spent_ms,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to submit');

      setData(prev => ({
        ...prev,
        correct_option_id: json.correct_option_id,
        status: { is_done: true, last_is_correct: json.is_correct, last_selected_option_id: selected },
        options: (prev?.options || []).map(o => ({
          ...o,
          is_correct: o.id === json.correct_option_id,
        })),
      }));

      if (json.is_correct) {
        setGotCorrect(true);
      } else {
        setWrongOptionIds(prev => [...prev, selected]);
      }
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  function handleGiveUp() {
    setGaveUp(true);
    setShowRationale(true);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const locked = gotCorrect || gaveUp;
      if (e.key === 'ArrowLeft' && hasPrev) goPrev();
      if (e.key === 'ArrowRight' && hasNext) goNext();
      if (e.key === 'Enter' && !locked && selected) handleSubmit();
      if (['a', 'b', 'c', 'd', 'e'].includes(e.key.toLowerCase()) && !locked) {
        const options = data?.options || [];
        const idx = e.key.toLowerCase().charCodeAt(0) - 97;
        if (idx < options.length) setSelected(options[idx].id);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const formatElapsed = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  if (loading) return <main className="container"><div className="muted" style={{ marginTop: 40 }}>Loading...</div></main>;

  const options = data?.options || [];
  const locked = gotCorrect || gaveUp;
  const correctOptionId = data?.correct_option_id || null;

  // Determine if this is a reading-like section (english/reading have stimulus)
  const hasStimulusContent = htmlHasContent(data?.stimulus_html);
  const useTwoCol = hasStimulusContent;

  return (
    <main className="container" style={{ maxWidth: 1100 }}>
      {msg && <Toast kind={msg?.kind} message={msg?.text} />}

      {/* Top bar */}
      <div className="card" style={{ padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/act-practice" className="btn secondary" style={{ fontSize: 12, padding: '4px 12px' }}>
            Back
          </Link>
          {sid && totalFromUrl > 0 && (
            <span className="muted small">
              Question {indexFromUrl} of {totalFromUrl}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="pill">{SECTION_LABELS[data?.section] || data?.section}</span>
          {data?.difficulty != null && (
            <span className="pill">{DIFF_LABEL[data.difficulty] || `D${data.difficulty}`}</span>
          )}
          <span className="muted small">{formatElapsed(elapsedMs)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secondary" disabled={!hasPrev} onClick={goPrev}>Prev</button>
          <button className="btn secondary" disabled={!hasNext} onClick={goNext}>Next</button>
        </div>
      </div>

      {/* Question content */}
      <div className={useTwoCol ? 'qaTwoCol' : ''}>
        {/* Stimulus (left column or above) */}
        {hasStimulusContent && (
          <div className={useTwoCol ? 'qaLeft' : 'card'} style={!useTwoCol ? { marginBottom: 12, padding: 20 } : undefined}>
            <HtmlBlock html={data.stimulus_html} />
          </div>
        )}

        {/* Question + answers */}
        <div className={useTwoCol ? 'qaRight' : ''}>
          <div className="card" style={{ padding: 20 }}>
            {/* Taxonomy breadcrumb */}
            <div className="muted small" style={{ marginBottom: 8 }}>
              {data?.category || ''}
              {data?.subcategory ? ` > ${data.subcategory}` : ''}
              {data?.external_id ? ` · ${data.external_id}` : ''}
            </div>

            {/* Stem */}
            <div style={{ marginBottom: 16 }}>
              <HtmlBlock html={data?.stem_html} />
            </div>

            {/* Options */}
            <div style={{ display: 'grid', gap: 8 }}>
              {options.map((opt) => {
                const isSelected = String(selected) === String(opt.id);
                const isWrong = wrongOptionIds.includes(opt.id);
                const isCorrect = locked && correctOptionId && String(opt.id) === String(correctOptionId);

                let cls = 'option';
                if (isSelected) cls += ' selected';
                if (isWrong) cls += ' incorrect';
                if (locked) {
                  if (isCorrect && (isSelected || gaveUp || gotCorrect)) cls += ' correct';
                  if (!isSelected && isCorrect && (gaveUp || gotCorrect)) cls += ' revealCorrect';
                } else if (isSelected && !isWrong) cls += '';

                return (
                  <button
                    key={opt.id}
                    className={cls}
                    onClick={() => !locked && setSelected(opt.id)}
                    disabled={locked || isWrong}
                  >
                    <div className="optionBadge">{opt.label}</div>
                    <div className="optionContent"><HtmlBlock className="prose" html={opt.content_html} /></div>
                  </button>
                );
              })}
            </div>

            {/* Action buttons */}
            <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
              {!locked && (
                <>
                  <button
                    className="btn"
                    disabled={!selected || submitting}
                    onClick={handleSubmit}
                  >
                    {submitting ? 'Submitting...' : wrongOptionIds.length > 0 ? 'Retry' : 'Submit'}
                  </button>
                  <button className="btn secondary" onClick={handleGiveUp}>
                    Give Up
                  </button>
                </>
              )}
              {locked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {gotCorrect && <span style={{ color: 'var(--green)', fontWeight: 600 }}>Correct!</span>}
                  {gaveUp && <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Answer revealed</span>}
                  {hasNext && (
                    <button className="btn" onClick={goNext}>Next Question</button>
                  )}
                </div>
              )}
            </div>

            {/* Rationale */}
            {locked && htmlHasContent(data?.rationale_html) && (
              <div style={{ marginTop: 16 }}>
                <button
                  className="btn secondary"
                  style={{ fontSize: 12, marginBottom: 8 }}
                  onClick={() => setShowRationale(r => !r)}
                >
                  {showRationale ? 'Hide Explanation' : 'Show Explanation'}
                </button>
                {showRationale && (
                  <div className="card" style={{ padding: 16, background: 'var(--bg)' }}>
                    <HtmlBlock html={data.rationale_html} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
