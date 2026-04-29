// Tutor-facing assignment report. Mirrors the practice-test
// score report's vocabulary so the two surfaces feel like one
// product:
//   - score strip up top
//   - daily-distribution heatmap so a tutor can see at a glance
//     whether the work was crammed or spaced
//   - by-domain breakdown card with per-skill rows + bars
//   - by-difficulty pills
//   - question map (clickable grid; status icon + difficulty
//     tint per cell) that drives a selected-question detail
//     card below
//
// Shared visual primitives:
//   - QuestionMapGrid (canonical home; the practice-test report
//     should switch to importing it in a follow-up)
//   - ReviewDailyMap (already shared with the student review)
//   - QuestionRenderer in mode='review' (used by every review
//     surface)
//
// The data props line up with buildSessionReview's output so a
// page can hand the view-model straight in.

'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { FloatingCalculator } from '@/lib/ui/FloatingCalculator';
import { ConceptTags } from './ConceptTags';
import { DesmosSavedStateButton } from './DesmosSavedStateButton';
import { FlashcardsButton } from './FlashcardsButton';
import { QuestionNotes } from './QuestionNotes';
import { QuestionMapGrid } from './QuestionMapGrid';
import { ReviewDailyMap } from './ReviewDailyMap';
import { DomainBreakdownCard, subjectFromDomainCode } from './DomainBreakdownCard';
import { formatDuration } from './format-duration';
import s from './AssignmentReport.module.css';

const MATH_DOMAIN_CODES_FOR_CALC = new Set(['H', 'P', 'Q', 'S']);

const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Very Hard', 5: 'Extreme' };

export function AssignmentReport({
  sessionMeta,
  items,
  metrics,
  timing = null,
  assignment = null,
  studentName = null,
  studentHref = null,
  backHref = null,
  backLabel = '← Back',
  desmosCanSave = false,
  conceptTagsCatalog = null,
  conceptTagsCanTag = false,
  conceptTagsCanDelete = false,
  questionNotesCanView = false,
  questionNotesIsAdmin = false,
  currentUserId = null,
  // Optional URL the tutor can click to force a fresh rebuild
  // of the report from raw attempts (skips whichever
  // practice_sessions row the page picked, expands to legacy
  // v1 attempt ids). Set on the session view; null on the
  // already-rebuilt per-trainee view.
  rebuildHref = null,
}) {
  // Live Desmos calc handle for the saved-state button. The
  // FloatingCalculator below renders a single panel for the whole
  // report, so the same ref serves every selected question.
  const calcRef = useRef(null);
  const groups = useMemo(() => buildDomainGroups(items), [items]);

  const firstReal = items.find((it) => !it.missing) ?? items[0];
  const [selectedPosition, setSelectedPosition] = useState(
    firstReal ? firstReal.position : 0,
  );
  const [revealed, setRevealed] = useState(() => new Set());

  function reveal(position) {
    setRevealed((prev) => {
      if (prev.has(position)) return prev;
      const next = new Set(prev);
      next.add(position);
      return next;
    });
  }

  const selected = items.find((it) => it.position === selectedPosition) ?? items[0];
  const isRevealed = revealed.has(selected?.position);

  const sessionDate = formatSessionDate(sessionMeta.createdAt);
  const accuracyPct = metrics.accuracy == null
    ? null
    : Math.round(metrics.accuracy * 100);

  const totalMs = timing?.totalMs ?? 0;
  const medianMs = timing?.medianMs ?? 0;
  const measuredCount = timing?.measuredCount ?? 0;

  const weakSkills = useMemo(() => buildWeakSkills(metrics), [metrics]);

  // Split metrics.byDomain into RW + Math buckets so the
  // DomainBreakdownCard component (subject-tinted bars in the
  // shared style) can render one card per subject — same pattern
  // as the practice-test results page. Domains without a
  // recognised code fall into RW since most legacy rows on the
  // RW side have older codes.
  const { rwDomains, mathDomains } = useMemo(
    () => splitDomainsBySubject(metrics.byDomain ?? []),
    [metrics],
  );

  return (
    <main className={s.container}>
      {backHref && (
        <Link href={backHref} className={s.breadcrumb}>{backLabel}</Link>
      )}

      <header className={s.header}>
        <div className={s.headerMain}>
          <div className={s.eyebrow}>
            {assignment ? 'Assignment report' : 'Session report'}
          </div>
          <h1 className={s.h1}>
            {assignment ? assignment.title : sessionDate}
          </h1>
          <div className={s.subtitleRow}>
            {studentName && (studentHref ? (
              <Link href={studentHref} className={s.studentLink}>
                {studentName}
              </Link>
            ) : (
              <span className={s.studentName}>{studentName}</span>
            ))}
            {studentName && <span className={s.dot}>·</span>}
            <span>{sessionDate}</span>
            {totalMs > 0 && (
              <>
                <span className={s.dot}>·</span>
                <span>{formatDuration(totalMs)} working time</span>
              </>
            )}
          </div>
        </div>
        {rebuildHref && (
          <Link
            href={rebuildHref}
            className={s.rebuildBtn}
            title="Recompute the report from every attempt the student has on this assignment's questions"
          >
            ↻ Rebuild from attempts
          </Link>
        )}
      </header>

      {/* ---------- Stat strip ---------- */}
      <section className={s.statStrip}>
        <Stat
          label="Questions"
          value={`${metrics.attempted} / ${metrics.total}`}
          sub={
            metrics.attempted < metrics.total
              ? `${metrics.total - metrics.attempted} unanswered`
              : 'All answered'
          }
        />
        <Stat
          label="Correct"
          value={metrics.correct}
          sub={`${metrics.attempted - metrics.correct} wrong`}
          tone={accuracyPct == null ? 'neutral' : accuracyTone(accuracyPct)}
        />
        <Stat
          label="Accuracy"
          value={accuracyPct == null ? '—' : `${accuracyPct}%`}
          sub={accuracyBand(accuracyPct)}
          tone={accuracyPct == null ? 'neutral' : accuracyTone(accuracyPct)}
        />
        <Stat
          label="Time"
          value={formatDuration(totalMs) || '—'}
          sub={
            measuredCount > 0
              ? `Median ${formatDuration(medianMs)} per question`
              : 'No timing recorded'
          }
        />
      </section>

      {/* ---------- Daily distribution ---------- */}
      {assignment?.dailyMap?.days?.length > 0 && (
        <section className={s.card}>
          <div className={s.cardHead}>
            <div className={s.cardHeadMain}>
              <h2 className={s.h2}>Daily distribution</h2>
              <p className={s.cardHint}>
                One cell per day from the assignment&apos;s issue
                date through today. Darker cells mean more
                attempts that day; gaps make &quot;all in one
                sitting&quot; vs. spaced practice obvious.
              </p>
            </div>
          </div>
          <ReviewDailyMap dailyMap={assignment.dailyMap} />
        </section>
      )}

      {/* ---------- Weak spots + by-domain breakdown ---------- */}
      {weakSkills.length > 0 && (
        <section className={s.weakCard}>
          <div className={s.weakLabel}>Weak spots</div>
          <div className={s.weakRow}>
            {weakSkills.map((sk) => (
              <span key={sk.name} className={s.weakPill}>
                {sk.name}
                <span className={s.weakPillCount}>{sk.wrong}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {(rwDomains.length > 0 || mathDomains.length > 0) && (
        <section className={s.cardRow}>
          {rwDomains.length > 0 && (
            <DomainBreakdownCard
              title="Reading & Writing"
              tone="rw"
              domains={rwDomains}
            />
          )}
          {mathDomains.length > 0 && (
            <DomainBreakdownCard
              title="Math"
              tone="math"
              domains={mathDomains}
            />
          )}
        </section>
      )}

      {/* ---------- By-difficulty ---------- */}
      {metrics.byDifficulty.length > 0 && (
        <section className={s.card}>
          <div className={s.cardHead}>
            <h2 className={s.h2}>By difficulty</h2>
          </div>
          <div className={s.diffRow}>
            {metrics.byDifficulty
              .filter((d) => d.difficulty)
              .map((d) => {
                const pct =
                  d.total > 0 ? Math.round((d.correct / d.total) * 100) : null;
                return (
                  <div key={d.difficulty} className={s.diffTile}>
                    <div className={s.diffLabel}>
                      {DIFF_LABEL[d.difficulty] ?? `Difficulty ${d.difficulty}`}
                    </div>
                    <div className={s.diffValue}>
                      {d.correct} / {d.total}
                    </div>
                    {pct != null && (
                      <div className={`${s.diffPct} ${s[`tone_${accuracyTone(pct)}`] ?? ''}`}>
                        {pct}%
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* ---------- Question map ---------- */}
      <section className={s.card}>
        <div className={s.cardHead}>
          <div className={s.cardHeadMain}>
            <h2 className={s.h2}>Per-question review</h2>
            <p className={s.cardHint}>
              Every question, color-coded by difficulty with a
              corner mark for status. Click any cell to open the
              detail below; revealed answers stay marked with a
              dot so the tutor can track progress through the
              review.
            </p>
          </div>
        </div>

        <QuestionMapGrid
          groups={groups}
          selectedId={selected?.position}
          onSelect={setSelectedPosition}
          revealed={revealed}
        />
      </section>

      {/* ---------- Selected-question detail ---------- */}
      {selected && (
        <section className={s.questionCard}>
          <div className={s.questionHeader}>
            <div className={s.questionHeaderLeft}>
              <span className={s.questionNum}>
                Question {selected.position + 1}
              </span>
              {selected.externalId && (
                <span className={s.questionCode}>{selected.externalId}</span>
              )}
              <span className={s.questionMeta}>
                {selected.taxonomy?.domain_name && (
                  <>{selected.taxonomy.domain_name}</>
                )}
                {selected.taxonomy?.skill_name && (
                  <> · {selected.taxonomy.skill_name}</>
                )}
                {selected.taxonomy?.difficulty != null && (
                  <> · {DIFF_LABEL[selected.taxonomy.difficulty] ?? `Difficulty ${selected.taxonomy.difficulty}`}</>
                )}
                {selected.studentAnswer?.timeSpentMs != null && (
                  <> · {formatDuration(selected.studentAnswer.timeSpentMs)}</>
                )}
              </span>
            </div>
            <div className={s.questionHeaderRight}>
              {/* Calculator + Desmos saved state — only on math
                  questions. Mirrors the practice-test report so a
                  tutor can poke at graphs while reviewing. */}
              {!selected.missing && MATH_DOMAIN_CODES_FOR_CALC.has(selected.taxonomy?.domain_code ?? '') && (
                <FloatingCalculator
                  storageKey={`desmos:report:${sessionMeta.sessionId}`}
                  onCalcReady={(c) => { calcRef.current = c; }}
                />
              )}
              {!selected.missing
                && MATH_DOMAIN_CODES_FOR_CALC.has(selected.taxonomy?.domain_code ?? '')
                && (desmosCanSave || selected.desmosSavedState != null) && (
                <DesmosSavedStateButton
                  key={`desmos-${selected.questionId}`}
                  questionId={selected.questionId}
                  initialSavedState={selected.desmosSavedState ?? null}
                  canSave={desmosCanSave}
                  calcRef={calcRef}
                />
              )}
              {questionNotesCanView && !selected.missing && (
                <QuestionNotes
                  key={`notes-${selected.questionId}`}
                  questionId={selected.questionId}
                  initialNotes={selected.questionNotes ?? []}
                  isAdmin={questionNotesIsAdmin}
                  currentUserId={currentUserId}
                  canView={questionNotesCanView}
                />
              )}
              <FlashcardsButton />
              {!isRevealed && !selected.missing && (
                <button
                  type="button"
                  className={s.revealBtn}
                  onClick={() => reveal(selected.position)}
                >
                  Reveal answer &amp; rationale
                </button>
              )}
              {isRevealed && selected.studentAnswer && (
                <span
                  className={
                    selected.studentAnswer.isCorrect
                      ? s.resultBadgeCorrect
                      : s.resultBadgeWrong
                  }
                >
                  {selected.studentAnswer.isCorrect ? 'Correct' : 'Incorrect'}
                </span>
              )}
              {isRevealed && !selected.studentAnswer && (
                <span className={s.resultBadgeSkipped}>Unanswered</span>
              )}
            </div>
          </div>

          {selected.missing ? (
            <p className={s.missingNote}>
              This question is no longer available in the question bank.
            </p>
          ) : (
            <QuestionRenderer
              key={`assignment-${selected.position}-${isRevealed ? 'r' : 'q'}`}
              mode="review"
              layout={selected.layout ?? 'single'}
              question={selected}
              selectedOptionId={selected.studentAnswer?.selectedOptionId ?? null}
              responseText={selected.studentAnswer?.responseText ?? ''}
              result={isRevealed ? {
                isCorrect: selected.studentAnswer?.isCorrect ?? null,
                correctOptionId: selected.reveal.correctOptionId,
                correctAnswerDisplay: selected.reveal.correctAnswerDisplay,
                rationaleHtml: selected.reveal.rationaleHtml,
              } : null}
            />
          )}

          {conceptTagsCanTag && !selected.missing && conceptTagsCatalog && (
            <div className={s.tutorTools}>
              <ConceptTags
                key={`tags-${selected.questionId}`}
                questionId={selected.questionId}
                initialTags={conceptTagsCatalog}
                initialQuestionTagIds={selected.conceptTagIds ?? []}
                canTag={conceptTagsCanTag}
                canDelete={conceptTagsCanDelete}
              />
            </div>
          )}
        </section>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function Stat({ label, value, sub, tone = 'neutral' }) {
  const cls = [s.statTile, s[`statTile_${tone}`] ?? null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      {sub && <div className={s.statSub}>{sub}</div>}
    </div>
  );
}

const MATH_DOMAIN_CODES = new Set(['H', 'P', 'Q', 'S']);
const RW_DOMAIN_CODES = new Set(['INI', 'CAS', 'EOI', 'SEC']);
const SUBJECT_LABEL = { RW: 'Reading & Writing', MATH: 'Math', OTHER: 'Other' };
const SUBJECT_ORDER = { RW: 0, MATH: 1, OTHER: 2 };

function subjectGroupKey(code) {
  if (MATH_DOMAIN_CODES.has(code)) return 'MATH';
  if (RW_DOMAIN_CODES.has(code)) return 'RW';
  return 'OTHER';
}

function buildDomainGroups(items) {
  // Two-level group: subject → domain. Each header reads e.g.
  // "Reading & Writing · Information & Ideas", parallel to the
  // test report's "Reading & Writing · Module 1" treatment.
  const byKey = new Map();
  for (const it of items) {
    const code = it.taxonomy?.domain_code ?? '';
    const subject = subjectGroupKey(code);
    const domainName = it.taxonomy?.domain_name ?? 'Other';
    const key = `${subject}::${domainName}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        subject,
        domainName,
        items: [],
        correct: 0,
        total: 0,
      });
    }
    const group = byKey.get(key);
    group.items.push(it);
    if (!it.missing) {
      group.total += 1;
      if (it.studentAnswer?.isCorrect) group.correct += 1;
    }
  }

  const groups = Array.from(byKey.values()).sort((a, b) => {
    const ao = SUBJECT_ORDER[a.subject] ?? 99;
    const bo = SUBJECT_ORDER[b.subject] ?? 99;
    if (ao !== bo) return ao - bo;
    return a.domainName.localeCompare(b.domainName);
  });

  return groups.map((g) => ({
    key: g.key,
    label: (
      <>
        <span style={{ color: 'var(--color-navy-900)' }}>
          {SUBJECT_LABEL[g.subject] ?? g.subject}
        </span>
        <span style={{ color: 'var(--fg3)', fontWeight: 400, margin: '0 4px' }}>·</span>
        <span style={{ color: 'var(--fg2)' }}>{g.domainName}</span>
      </>
    ),
    countNote: `${g.correct}/${g.total}`,
    items: g.items.map((it) => ({
      id: it.position,
      ordinalLabel: it.position + 1,
      status: it.status,
      difficulty: it.taxonomy?.difficulty ?? null,
      missing: it.missing,
      ariaLabel: `Question ${it.position + 1}, ${it.status}`,
    })),
  }));
}

function buildWeakSkills(metrics) {
  const out = [];
  for (const d of metrics.byDomain ?? []) {
    for (const sk of d.skills ?? []) {
      const wrong = sk.total - sk.correct;
      if (wrong > 0) out.push({ name: sk.name, wrong, total: sk.total });
    }
  }
  out.sort((a, b) => b.wrong - a.wrong || b.total - a.total);
  return out.slice(0, 6);
}

function accuracyTone(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'ok';
  return 'bad';
}

function accuracyBand(pct) {
  if (pct == null) return '—';
  if (pct >= 90) return 'Mastery';
  if (pct >= 80) return 'Strong';
  if (pct >= 60) return 'Working';
  if (pct >= 40) return 'Needs review';
  return 'Struggling';
}

function splitDomainsBySubject(byDomain) {
  // metrics.byDomain shape: [{ name, code, correct, total, skills:
  // [{ name, correct, total }] }]. DomainBreakdownCard expects
  // the same shape (one less field — domains there are flat).
  // Skills get sorted weakest-first within each domain so the
  // review-lesson plan reads top-to-bottom.
  const rwDomains = [];
  const mathDomains = [];
  for (const d of byDomain) {
    const subj = subjectFromDomainCode(d.code);
    const skills = (d.skills ?? [])
      .map((sk) => ({
        name: sk.name,
        correct: sk.correct ?? 0,
        total: sk.total ?? 0,
      }))
      .sort((a, b) => skillRank(a) - skillRank(b));
    const entry = {
      name: d.name,
      correct: d.correct ?? 0,
      total: d.total ?? 0,
      skills,
    };
    if (subj === 'MATH') {
      mathDomains.push(entry);
    } else {
      rwDomains.push(entry);
    }
  }
  return { rwDomains, mathDomains };
}

function skillRank(sk) {
  if (sk.total <= 0) return Number.POSITIVE_INFINITY;
  return sk.correct / sk.total;
}

function formatSessionDate(iso) {
  if (!iso) return 'Practice session';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Practice session';
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
