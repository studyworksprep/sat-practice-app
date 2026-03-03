'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import HtmlBlock from '../../../../../components/HtmlBlock';

const SUBJECT_LABEL = { rw: 'Reading & Writing', RW: 'Reading & Writing', math: 'Math', m: 'Math', M: 'Math' };

function pct(correct, total) {
  if (!total) return 0;
  return Math.round((correct / total) * 100);
}

function AccuracyBar({ correct, total, colorClass }) {
  const p = pct(correct, total);
  const cls = colorClass || (p >= 70 ? 'green' : p >= 50 ? 'yellow' : 'red');
  return (
    <div className="dbProgressBar" style={{ marginTop: 4 }}>
      <div className={`dbProgressFill ${cls}`} style={{ width: `${p}%` }} />
    </div>
  );
}

function QuestionReviewItem({ q, index }) {
  const [open, setOpen] = useState(false);

  const statusClass = q.is_correct ? 'correct' : q.was_answered ? 'incorrect' : 'skipped';
  const statusLabel = q.is_correct ? '✓' : q.was_answered ? '✗' : '—';

  return (
    <div className={`ptReviewItem ${statusClass}`}>
      <button className="ptReviewToggle" onClick={() => setOpen((o) => !o)}>
        <span className={`dbActivityDot ${q.is_correct ? 'correct' : 'incorrect'}`}>{statusLabel}</span>
        <span className="ptReviewQNum">Q{q.ordinal}</span>
        <span className="ptReviewSkill muted small">{q.skill_name || q.domain_name || ''}</span>
        <span className="ptReviewChevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="ptReviewBody">
          {q.stimulus_html && (
            <div className="ptStimulus" style={{ marginBottom: 12 }}>
              <HtmlBlock html={q.stimulus_html} />
            </div>
          )}
          <div className="ptStem" style={{ marginBottom: 12 }}>
            <HtmlBlock html={q.stem_html} />
          </div>

          {q.options?.length > 0 ? (
            <div className="ptOptions ptOptionsReview">
              {q.options.map((opt) => {
                const userSelected = q.selected_option_id === opt.id;
                const isCorrect = q.correct_answer?.correct_option_id === opt.id ||
                  (q.correct_answer?.correct_option_ids || []).includes(opt.id);
                const cls = isCorrect ? 'optCorrect' : userSelected ? 'optWrong' : '';
                return (
                  <div key={opt.id} className={`ptOption ptOptionStatic ${cls}`}>
                    <span className="ptOptionLabel">{opt.label || String.fromCharCode(65 + (opt.ordinal - 1))}</span>
                    <HtmlBlock html={opt.content_html} className="ptOptionContent" />
                    {isCorrect && <span className="ptOptionTag">Correct</span>}
                    {userSelected && !isCorrect && <span className="ptOptionTag wrong">Your answer</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="ptSprWrap">
              <div className="muted small">Your answer: <strong>{q.response_text || '(none)'}</strong></div>
              {q.correct_answer?.correct_text && (
                <div className="muted small">Correct answer: <strong>{q.correct_answer.correct_text}</strong></div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  const { attemptId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openSections, setOpenSections] = useState({});

  useEffect(() => {
    fetch(`/api/practice-tests/attempt/${attemptId}/results`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load results.'); setLoading(false); });
  }, [attemptId]);

  if (loading) return <div className="container" style={{ paddingTop: 48, textAlign: 'center' }}><p className="muted">Loading results…</p></div>;
  if (error || data?.error) return <div className="container" style={{ paddingTop: 48 }}><p style={{ color: 'var(--danger)' }}>{error || data?.error}</p></div>;

  const SUBJECT_ORDER = ['RW', 'rw', 'M', 'm', 'math'];

  function fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function toggleSection(key) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Group questions by subject then module
  const questionsBySubjectModule = {};
  for (const q of data.questions || []) {
    const key = `${q.subject_code}/${q.module_number}`;
    if (!questionsBySubjectModule[key]) questionsBySubjectModule[key] = [];
    questionsBySubjectModule[key].push(q);
  }

  return (
    <main className="container" style={{ maxWidth: 720, paddingTop: 32, paddingBottom: 64 }}>
      {/* Back link */}
      <Link href="/practice-test" className="muted small" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: 16 }}>
        ← Practice Tests
      </Link>

      <h1 className="h1" style={{ marginBottom: 4 }}>{data.test_name || 'Practice Test'}</h1>
      {data.completed_at && (
        <p className="muted small" style={{ marginBottom: 24 }}>Completed {fmtDate(data.completed_at)}</p>
      )}

      {/* Score summary */}
      <div className="card ptResultsScore" style={{ marginBottom: 16 }}>
        <div className="ptComposite">
          <span className="ptCompositeNum">{data.composite ?? '—'}</span>
          <span className="ptCompositeLabel">Total Score</span>
        </div>
        <div className="ptSectionScores">
          {SUBJECT_ORDER.map((subj) => {
            const sec = data.sections?.[subj];
            if (!sec) return null;
            return (
              <div key={subj} className="ptSectionScore">
                <span className="ptSectionScoreNum">{sec.scaled}</span>
                <span className="ptSectionScoreLabel">{SUBJECT_LABEL[subj]}</span>
                <span className="muted small">{sec.correct}/{sec.total} correct</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Domain / topic breakdown */}
      {data.domains?.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="h2" style={{ marginBottom: 12 }}>Skills Breakdown</div>
          <table className="ptDomainTable">
            <thead>
              <tr>
                <th>Domain / Skill</th>
                <th style={{ textAlign: 'right' }}>Correct</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.domains.map((d) => {
                const isOpen = openSections[d.domain_name];
                return [
                  <tr key={d.domain_name} className="ptDomainRow" onClick={() => toggleSection(d.domain_name)} style={{ cursor: 'pointer' }}>
                    <td><strong>{d.domain_name}</strong> <span className="muted small">{isOpen ? '▲' : '▼'}</span></td>
                    <td style={{ textAlign: 'right' }}>{d.correct}/{d.total}</td>
                    <td><AccuracyBar correct={d.correct} total={d.total} /></td>
                  </tr>,
                  ...(isOpen ? (d.skills || []).map((s) => (
                    <tr key={`${d.domain_name}-${s.skill_name}`} className="ptSkillRow">
                      <td style={{ paddingLeft: 24 }}>{s.skill_name}</td>
                      <td style={{ textAlign: 'right' }}>{s.correct}/{s.total}</td>
                      <td><AccuracyBar correct={s.correct} total={s.total} /></td>
                    </tr>
                  )) : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Question-by-question review */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="h2" style={{ marginBottom: 12 }}>Question Review</div>
        {SUBJECT_ORDER.map((subj) =>
          [1, 2].map((modNum) => {
            const key = `${subj}/${modNum}`;
            const qs = questionsBySubjectModule[key];
            if (!qs?.length) return null;
            return (
              <div key={key} style={{ marginBottom: 20 }}>
                <div className="ptReviewModuleLabel">
                  {SUBJECT_LABEL[subj]} — Module {modNum}
                </div>
                {qs.map((q, i) => (
                  <QuestionReviewItem key={q.question_version_id} q={q} index={i} />
                ))}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
