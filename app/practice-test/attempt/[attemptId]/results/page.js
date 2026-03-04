'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import HtmlBlock from '../../../../../components/HtmlBlock';

const SUBJECT_LABEL = { rw: 'Reading & Writing', RW: 'Reading & Writing', math: 'Math', m: 'Math', M: 'Math', MATH: 'Math' };
const SUBJECT_ORDER = ['RW', 'rw', 'MATH', 'M', 'm', 'math'];

const DOMAIN_ABBREV = {
  'Craft and Structure': 'C&S',
  'Information and Ideas': 'Info',
  'Standard English Conventions': 'SEC',
  'Expression of Ideas': 'Expr',
  'Algebra': 'Alg',
  'Advanced Math': 'Adv',
  'Problem-Solving and Data Analysis': 'Data',
  'Geometry and Trigonometry': 'Geo',
};

function abbrev(name) {
  if (!name) return '';
  return DOMAIN_ABBREV[name] || name.slice(0, 4);
}

function pct(correct, total) {
  if (!total) return 0;
  return Math.round((correct / total) * 100);
}

function AccuracyBar({ correct, total }) {
  const p = pct(correct, total);
  const cls = p >= 70 ? 'green' : p >= 50 ? 'yellow' : 'red';
  return (
    <div className="dbProgressBar" style={{ marginTop: 4 }}>
      <div className={`dbProgressFill ${cls}`} style={{ width: `${p}%` }} />
    </div>
  );
}

// ─── Question detail panel ─────────────────────────────────────────────────

function QuestionDetail({ q, allQuestions, onSelect }) {
  const [showAnswer, setShowAnswer] = useState(false);

  if (!q) {
    return (
      <div className="ptrvDetailEmpty">
        <p className="muted small">Select a question to review it.</p>
      </div>
    );
  }

  const idx = allQuestions.findIndex((x) => x.question_version_id === q.question_version_id);
  const hasPrev = idx > 0;
  const hasNext = idx < allQuestions.length - 1;

  const correctOptionId = q.correct_answer?.correct_option_id;
  const correctOptionIds = q.correct_answer?.correct_option_ids || [];
  const correctOption = q.options?.find(
    (o) => o.id === correctOptionId || correctOptionIds.includes(o.id)
  );
  const selectedOption = q.options?.find((o) => o.id === q.selected_option_id);

  return (
    <div className="ptrvDetail">
      {/* Header */}
      <div className="ptrvDetailHeader">
        <div className="ptrvDetailMeta">
          <span className={`ptrvQBadge ${q.is_correct ? 'correct' : q.was_answered ? 'incorrect' : 'skipped'}`}>
            Q{q.ordinal}
          </span>
          <div className="ptrvDetailMetaText">
            <span className="ptrvDetailSubj">{SUBJECT_LABEL[q.subject_code] || q.subject_code} · Module {q.module_number}</span>
            {q.domain_name && <span className="ptrvDetailDomain">{q.domain_name}</span>}
            {q.skill_name && q.skill_name !== q.domain_name && (
              <span className="ptrvDetailSkill">{q.skill_name}</span>
            )}
          </div>
        </div>
        <div className="ptrvDetailNav">
          <button
            className="btn secondary ptrvNavBtn"
            disabled={!hasPrev}
            onClick={() => hasPrev && onSelect(allQuestions[idx - 1])}
            aria-label="Previous question"
          >←</button>
          <button
            className="btn secondary ptrvNavBtn"
            disabled={!hasNext}
            onClick={() => hasNext && onSelect(allQuestions[idx + 1])}
            aria-label="Next question"
          >→</button>
        </div>
      </div>

      {/* Question content */}
      <div className="ptrvDetailBody">
        {q.stimulus_html && (
          <div className="ptrvStimulus">
            <HtmlBlock html={q.stimulus_html} className="prose" />
          </div>
        )}
        <div className="ptrvDetailStem">
          <HtmlBlock html={q.stem_html} className="prose" />
        </div>
      </div>

      {/* Answer reveal */}
      <div className="ptrvAnswerSection">
        <button
          className={`ptrvAnswerToggle${showAnswer ? ' open' : ''}`}
          onClick={() => setShowAnswer((v) => !v)}
        >
          {showAnswer ? 'Hide Answer' : 'Show Answer'}
          <span className="ptrvToggleChevron">{showAnswer ? '▲' : '▼'}</span>
        </button>

        {showAnswer && (
          <div className="ptrvAnswerBody">
            {q.options?.length > 0 ? (
              /* MCQ — show all options with correct/incorrect state */
              <div className="optionList ptrvOptionList">
                {!q.was_answered && (
                  <p className="muted small" style={{ marginBottom: 6 }}>Not answered — correct answer shown.</p>
                )}
                {q.options.map((opt) => {
                  const isSelected = opt.id === q.selected_option_id;
                  const isCorrectOpt = opt.id === correctOptionId || correctOptionIds.includes(opt.id);
                  let cls = 'option ptrvReviewOption';
                  if (isSelected) {
                    cls += q.is_correct ? ' correct' : ' incorrect';
                  } else if (isCorrectOpt && (!q.is_correct || !q.was_answered)) {
                    cls += ' revealCorrect';
                  }
                  return (
                    <div key={opt.id} className={cls}>
                      <span className="optionBadge">{opt.label}</span>
                      <div className="optionContent">
                        <HtmlBlock html={opt.content_html || ''} className="prose" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* SPR / free-response */
              <div className="ptrvAnswerRows">
                <div className="ptrvAnswerRow">
                  <span className="ptrvAnswerLabel">Your answer</span>
                  <span className={`ptrvAnswerValue ${q.is_correct ? 'correct' : q.was_answered ? 'incorrect' : 'skipped'}`}>
                    {q.response_text || 'No answer given'}
                  </span>
                </div>
                {!q.is_correct && q.correct_answer?.correct_text && (
                  <div className="ptrvAnswerRow">
                    <span className="ptrvAnswerLabel">Correct answer</span>
                    <span className="ptrvAnswerValue correct">{q.correct_answer.correct_text}</span>
                  </div>
                )}
              </div>
            )}

            {q.rationale_html && (
              <div className="ptrvRationale">
                <div className="ptrvRationaleLabel">Explanation</div>
                <HtmlBlock html={q.rationale_html} className="ptrvRationaleBody prose" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { attemptId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedQ, setSelectedQ] = useState(null);
  const [openDomains, setOpenDomains] = useState({});

  useEffect(() => {
    fetch(`/api/practice-tests/attempt/${attemptId}/results`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
        if (d.questions?.length) setSelectedQ(d.questions[0]);
      })
      .catch(() => { setError('Failed to load results.'); setLoading(false); });
  }, [attemptId]);

  if (loading) return <div className="container" style={{ paddingTop: 48, textAlign: 'center' }}><p className="muted">Loading results…</p></div>;
  if (error || data?.error) return <div className="container" style={{ paddingTop: 48 }}><p style={{ color: 'var(--danger)' }}>{error || data?.error}</p></div>;

  function fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function toggleDomain(name) {
    setOpenDomains((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  // Group questions by subject/module, preserving original order
  const groupKeys = [];
  const questionsByGroup = {};
  for (const q of data.questions || []) {
    const key = `${q.subject_code}/${q.module_number}`;
    if (!questionsByGroup[key]) { questionsByGroup[key] = []; groupKeys.push(key); }
    questionsByGroup[key].push(q);
  }

  return (
    <main className="container ptrvMain">

      <Link href="/practice-test" className="muted small ptrvBack">← Practice Tests</Link>

      <h1 className="h1" style={{ marginBottom: 4 }}>{data.test_name || 'Practice Test'}</h1>
      {data.completed_at && (
        <p className="muted small" style={{ marginBottom: 24 }}>Completed {fmtDate(data.completed_at)}</p>
      )}

      {/* ── Summary card: scores + skills side by side ── */}
      <div className="card ptrvSummaryCard">
        <div className="ptrvSummaryInner">

          {/* Left column: composite + section scores */}
          <div className="ptrvScoreCol">
            <div className="ptrvCompositeWrap">
              <span className="ptCompositeNum">{data.composite ?? '—'}</span>
              <span className="ptCompositeLabel">Total Score</span>
            </div>
            <div className="ptrvDivider" />
            <div className="ptrvSections">
              {SUBJECT_ORDER.map((subj) => {
                const sec = data.sections?.[subj];
                if (!sec) return null;
                return (
                  <div key={subj} className="ptrvSectionItem">
                    <span className="ptrvSectionNum">{sec.scaled}</span>
                    <span className="ptrvSectionName">{SUBJECT_LABEL[subj]}</span>
                    <span className="muted small">{sec.correct}/{sec.total} correct</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vertical divider */}
          {data.domains?.length > 0 && <div className="ptrvSummaryDivider" />}

          {/* Right column: skills breakdown */}
          {data.domains?.length > 0 && (
            <div className="ptrvSkillsCol">
              <div className="h2" style={{ marginBottom: 12 }}>Skills Breakdown</div>
              <table className="ptDomainTable">
                <thead>
                  <tr>
                    <th>Domain / Skill</th>
                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Score</th>
                    <th style={{ width: 80 }} />
                  </tr>
                </thead>
                <tbody>
                  {data.domains.map((d) => {
                    const isOpen = openDomains[d.domain_name];
                    return [
                      <tr key={d.domain_name} className="ptDomainRow" onClick={() => toggleDomain(d.domain_name)} style={{ cursor: 'pointer' }}>
                        <td><strong>{d.domain_name}</strong> <span className="muted small">{isOpen ? '▲' : '▼'}</span></td>
                        <td style={{ textAlign: 'right', paddingRight: 8 }}>{d.correct}/{d.total}</td>
                        <td><AccuracyBar correct={d.correct} total={d.total} /></td>
                      </tr>,
                      ...(isOpen ? (d.skills || []).map((s) => (
                        <tr key={`${d.domain_name}-${s.skill_name}`} className="ptSkillRow">
                          <td style={{ paddingLeft: 20 }}>{s.skill_name}</td>
                          <td style={{ textAlign: 'right', paddingRight: 8 }}>{s.correct}/{s.total}</td>
                          <td><AccuracyBar correct={s.correct} total={s.total} /></td>
                        </tr>
                      )) : []),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>

      {/* ── Question review: tile grid + detail panel ── */}
      <div className="ptrvReviewRow">

        {/* Left: tile grid */}
        <div className="card ptrvTilesPanel">
          <div className="h2" style={{ marginBottom: 14 }}>Question Review</div>

          {SUBJECT_ORDER.map((subj) =>
            [1, 2].map((modNum) => {
              const key = `${subj}/${modNum}`;
              const qs = questionsByGroup[key];
              if (!qs?.length) return null;
              return (
                <div key={key} className="ptrvTileGroup">
                  <div className="ptrvTileGroupLabel">
                    {SUBJECT_LABEL[subj]} · Module {modNum}
                  </div>
                  <div className="ptrvTileGrid">
                    {qs.map((q) => {
                      const isSelected = selectedQ?.question_version_id === q.question_version_id;
                      const statusCls = q.is_correct ? 'correct' : q.was_answered ? 'incorrect' : 'skipped';
                      return (
                        <button
                          key={q.question_version_id}
                          className={`ptrvTile ${statusCls}${isSelected ? ' selected' : ''}`}
                          onClick={() => setSelectedQ(q)}
                          title={q.domain_name || ''}
                        >
                          <span className="ptrvTileNum">{q.ordinal}</span>
                          {q.domain_name && (
                            <span className="ptrvTileDomain">{abbrev(q.domain_name)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: detail panel (sticky) */}
        <div className="card ptrvDetailWrap">
          <QuestionDetail
            key={selectedQ?.question_version_id}
            q={selectedQ}
            allQuestions={data.questions || []}
            onSelect={setSelectedQ}
          />
        </div>

      </div>
    </main>
  );
}
