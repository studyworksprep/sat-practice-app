// Session review client island. Renders the "Practice Session
// Report" — a title with the session date, metrics (overall +
// by difficulty + by domain/skill), a clickable question map,
// and the currently-selected question below.
//
// Questions are NOT revealed by default. The student's initial
// answer is shown (as the selected / typed response, without any
// correct/incorrect styling), and a "Reveal answer & rationale"
// button opens the reveal state via the shared QuestionRenderer's
// `result` prop. Reveal state is tracked per-position in a Set,
// so navigating away and back keeps the reveal sticky.
//
// All content (stems, options, rationales) arrives server-rendered
// and already watermarked from the page.js — the client never
// fetches anything.

'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { FloatingCalculator } from '@/lib/ui/FloatingCalculator';
import { ReferenceSheetButton } from '@/lib/ui/ReferenceSheetButton';
import { ConceptTags } from './ConceptTags';
import { DesmosSavedStateButton } from './DesmosSavedStateButton';
import { ErrorLogButton } from './ErrorLogButton';
import { FlashcardsButton } from './FlashcardsButton';
import { QuestionMapGrid } from './QuestionMapGrid';
import { QuestionNotes } from './QuestionNotes';
import { StudentQuestionNotes } from './StudentQuestionNotes';
import { ReviewTimingBand } from './ReviewTimingBand';
import { ReviewDailyMap } from './ReviewDailyMap';
import { ReportHero } from './ReportHero';
import { SkillBreakdownCard } from './SkillBreakdownCard';
import { subjectFromDomainCode } from './DomainBreakdownCard';
import { formatDuration } from './format-duration';
import s from './ReviewInteractive.module.css';

// Same math-domain set the practice runner uses — only math
// items get the floating calculator button.
const CALCULATOR_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

/**
 * @param {object} props
 * @param {{sessionId: string, createdAt: string, mode: string}} props.sessionMeta
 * @param {Array} props.items - per-position question view models (see page.js)
 * @param {object} props.metrics - pre-aggregated session metrics
 * @param {object} [props.timing] - per-position timing view model
 * @param {object|null} [props.assignment] - assignment context when
 *   the session was started from an assignment (null otherwise)
 */
export function ReviewInteractive({
  sessionMeta,
  items,
  metrics,
  timing = null,
  assignment = null,
  desmosCanSave = false,
  conceptTagsCatalog = null,
  conceptTagsCanTag = false,
  conceptTagsCanDelete = false,
  questionNotesCanView = false,
  questionNotesIsAdmin = false,
  currentUserId = null,
  // Footer links — defaulting to the student's own /practice/*
  // routes. Tutor-tree pages override these so a tutor reviewing
  // a student's report doesn't get bounced through student-only
  // routes by the role gate.
  footerBackHref = '/practice/history',
  footerBackLabel = '← All practice sessions',
  footerNextHref = '/practice/start',
  footerNextLabel = 'Start another session →',
}) {
  const [selectedPosition, setSelectedPosition] = useState(0);
  const [revealed, setRevealed] = useState(() => new Set());
  const [hoverPosition, setHoverPosition] = useState(null);

  // Live calc handle from FloatingCalculator's inner DesmosPanel.
  // Shared across question navigations because the calculator
  // outlives the per-question selection — it's the same
  // FloatingCalculator instance for the whole review session.
  const calcRef = useRef(null);
  const [refOpen, setRefOpen] = useState(false);

  const selected = items[selectedPosition] ?? items[0];
  const isRevealed = revealed.has(selected.position);
  const isMath = CALCULATOR_DOMAINS.has(selected?.taxonomy?.domain_code ?? '');
  const showSavedStateBtn =
    isMath && (desmosCanSave || selected.desmosSavedState != null);

  function reveal(position) {
    setRevealed((prev) => {
      if (prev.has(position)) return prev;
      const next = new Set(prev);
      next.add(position);
      return next;
    });
  }

  const sessionDate = formatSessionDate(sessionMeta.createdAt);
  const accuracyPct = metrics.accuracy == null
    ? null
    : Math.round(metrics.accuracy * 100);

  // Split metrics.byDomain into RW + Math buckets so SkillBreakdownCard
  // can render the same green/amber/red segmented bars the practice-test
  // report uses. Domains without a recognised code fall into RW since
  // most legacy rows on the RW side have older codes.
  const { rwDomains, mathDomains } = (() => {
    const rw = [];
    const math = [];
    for (const d of metrics.byDomain ?? []) {
      const subj = subjectFromDomainCode(d.code);
      const skills = (d.skills ?? []).map((sk) => ({
        name: sk.name,
        correct: sk.correct ?? 0,
        total: sk.total ?? 0,
      }));
      const entry = {
        name: d.name,
        correct: d.correct ?? 0,
        total: d.total ?? 0,
        skills,
      };
      if (subj === 'MATH') math.push(entry);
      else rw.push(entry);
    }
    return { rwDomains: rw, mathDomains: math };
  })();

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>
          {assignment ? 'Assignment report' : 'Practice session report'}
        </div>
        <h1 className={s.h1}>
          {assignment ? assignment.title : sessionDate}
        </h1>
        <div className={s.subtitle}>
          {assignment && (
            <>
              Completed {sessionDate}
              {' · '}
            </>
          )}
          {metrics.total} question{metrics.total === 1 ? '' : 's'}
          {metrics.attempted !== metrics.total
            ? ` · ${metrics.attempted} attempted`
            : ''}
          {accuracyPct != null && ` · ${metrics.correct} correct · ${accuracyPct}%`}
        </div>
      </header>

      {/* ---------- Headline + supporting tiles ----------
           Same hero block the practice-test report uses, so a
           student moving between report types reads the same
           visual rhythm. Accuracy is the headline; tiles repeat
           questions answered, wrong, and time. */}
      <section className={s.metrics}>
        <ReportHero
          primary={{
            label: 'Accuracy',
            value: accuracyPct == null ? '—' : `${accuracyPct}%`,
            sub: accuracyPct == null
              ? 'No attempts yet'
              : `${metrics.correct} of ${metrics.attempted} correct${
                  metrics.attempted < metrics.total
                    ? ` · ${metrics.total - metrics.attempted} unanswered`
                    : ''
                }`,
          }}
          tiles={[
            {
              label: 'Questions',
              value: `${metrics.attempted} / ${metrics.total}`,
              sub: metrics.attempted < metrics.total
                ? `${metrics.total - metrics.attempted} unanswered`
                : 'All answered',
            },
            {
              label: 'Wrong answers',
              value: String(metrics.attempted - metrics.correct),
              sub: accuracyPct == null
                ? '—'
                : accuracyPct >= 80
                  ? 'Strong'
                  : accuracyPct >= 50
                    ? 'Mixed'
                    : 'Many to revisit',
              tone: accuracyToneFromPct(accuracyPct),
            },
            ...(timing && timing.measuredCount > 0
              ? [{
                  label: 'Time',
                  value: formatDuration(timing.totalMs ?? 0) || '—',
                  sub: timing.medianMs > 0
                    ? `Median ${formatDuration(timing.medianMs)} per question`
                    : null,
                }]
              : []),
          ]}
        />

        {metrics.byScoreBand.length > 0 && (
          <div className={s.card}>
            <div className={s.sectionLabel}>Accuracy by score band</div>
            <div className={s.diffRow}>
              {metrics.byScoreBand.map((d) => (
                <ScoreBandTile key={d.scoreBand} entry={d} />
              ))}
            </div>
          </div>
        )}

        {(rwDomains.length > 0 || mathDomains.length > 0) && (
          <div className={s.cardRow}>
            {rwDomains.length > 0 && (
              <SkillBreakdownCard
                title="Reading & Writing"
                tone="rw"
                domains={rwDomains}
              />
            )}
            {mathDomains.length > 0 && (
              <SkillBreakdownCard
                title="Math"
                tone="math"
                domains={mathDomains}
              />
            )}
          </div>
        )}

        {/* Timing band. Shown when any question has a measured
            time — for older sessions without time_spent_ms the
            band would be all-zero and unhelpful. */}
        {timing && timing.measuredCount > 0 && (
          <div className={s.card}>
            <div className={s.sectionLabel}>
              Timing — hover a segment for per-question detail
            </div>
            <ReviewTimingBand
              timing={timing}
              items={items}
              hoverPosition={hoverPosition}
              setHoverPosition={setHoverPosition}
              onSelect={setSelectedPosition}
            />
          </div>
        )}

        {/* Assignment-only daily practice map. */}
        {assignment && assignment.dailyMap.days.length > 0 && (
          <div className={s.card}>
            <div className={s.sectionLabel}>Daily practice — this assignment</div>
            <ReviewDailyMap dailyMap={assignment.dailyMap} />
          </div>
        )}
      </section>

      {/* Per-question review: map on the left, detail on the right
          on wide screens; stacks on narrow. The map column is sticky
          so it stays reachable as the student scrolls through the
          rationale. Mirrors AssignmentReport / TestResultsInteractive
          so all three review surfaces share one layout. */}
      <div className={s.reviewLayout}>
        <section className={`${s.card} ${s.reviewMapCard}`}>
          <div className={s.sectionLabel}>
            Question map — click any question to review it
          </div>
          <QuestionMapGrid
            groups={[{
              key: 'all',
              label: '',
              items: items.map((it) => ({
                id: it.position,
                ordinalLabel: it.position + 1,
                status: it.status,
                difficulty: it.taxonomy?.difficulty ?? null,
                marked: !!it.marked,
                missing: it.missing,
                ariaLabel: `Question ${it.position + 1}, ${it.status}${
                  it.marked ? ', marked' : ''
                }`,
              })),
            }]}
            selectedId={selectedPosition}
            onSelect={setSelectedPosition}
            revealed={revealed}
          />
        </section>

        <section className={s.questionCard}>
        <div className={s.questionHeader}>
          <div className={s.questionHeaderLeft}>
            <span className={s.questionNum}>
              Question {selected.position + 1} of {items.length}
            </span>
            {selected.externalId && (
              <span className={s.questionCode}>{selected.externalId}</span>
            )}
            {selected.taxonomy && (
              <span className={s.questionMeta}>
                {selected.taxonomy.domain_name}
                {selected.taxonomy.skill_name && ` · ${selected.taxonomy.skill_name}`}
                {selected.taxonomy.score_band != null && ` · score band ${selected.taxonomy.score_band}`}
              </span>
            )}
          </div>
          <div className={s.questionHeaderRight}>
            {/* Desmos saved state first — distinct lightbulb glyph
                anchors the leftmost slot on every math-question row. */}
            {showSavedStateBtn && (
              <DesmosSavedStateButton
                key={`desmos-${selected.questionId}`}
                questionId={selected.questionId}
                initialSavedState={selected.desmosSavedState ?? null}
                canSave={desmosCanSave}
                calcRef={calcRef}
              />
            )}
            {isMath && (
              <ReferenceSheetButton
                open={refOpen}
                onOpenChange={setRefOpen}
              />
            )}
            {isMath && (
              <FloatingCalculator
                storageKey={`desmos:review:session:${sessionMeta.sessionId}`}
                onCalcReady={(c) => { calcRef.current = c; }}
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
            {!selected.missing && (
              <StudentQuestionNotes
                key={`mynote-${selected.questionId}`}
                questionId={selected.questionId}
                initialNote={selected.studentNote ?? null}
                questionTaxonomy={selected.taxonomy ?? null}
              />
            )}
            <FlashcardsButton />
            {!selected.missing && (
              <ErrorLogButton
                key={`elog-${selected.questionId}`}
                questionId={selected.questionId}
                initialNote={selected.errorNote ?? null}
              />
            )}
          </div>
        </div>

        {selected.missing ? (
          <p className={s.missingNote}>
            This question is no longer available in the question bank.
          </p>
        ) : (
          <QuestionRenderer
            key={`review-${selected.position}-${isRevealed ? 'rev' : 'raw'}`}
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
            controlsNode={
              conceptTagsCanTag && conceptTagsCatalog ? (
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
              ) : null
            }
          />
        )}
        {!isRevealed && !selected.missing && (
          <div className="sw-reveal-row">
            <button
              type="button"
              className={s.revealBtn}
              onClick={() => reveal(selected.position)}
            >
              Reveal answer &amp; rationale
            </button>
          </div>
        )}
        </section>
      </div>

      <div className={s.footer}>
        {footerBackHref && (
          <Link href={footerBackHref} className={s.footerLink}>
            {footerBackLabel}
          </Link>
        )}
        {footerNextHref && (
          <Link href={footerNextHref} className={s.footerLinkPrimary}>
            {footerNextLabel}
          </Link>
        )}
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

// Score bands run 1–7. Tile color encodes the band itself (not
// accuracy): 1–3 green (easy), 4–5 yellow (medium), 6–7 red
// (hard), with within-group shading via .sw-band-{1..7} so Band
// 1 vs 2 vs 3 reads as different shades of green. Defined in
// app/styles/next-tools.css; same classes power AssignmentReport.
function ScoreBandTile({ entry }) {
  const pct = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : null;
  return (
    <div className={`${s.diffTile} sw-band-${entry.scoreBand}`}>
      <div className={s.diffLabel}>Band {entry.scoreBand}</div>
      <div className={s.diffValue}>
        {pct == null ? '—' : `${pct}%`}
      </div>
      <div className={s.diffSub}>
        {entry.correct} / {entry.total}
      </div>
      <div className={s.diffBar}>
        <div
          className={s.diffBarFill}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}


// ≥75 / ≥50 thresholds match SkillBreakdownCard's segmented
// bars so a 75% domain reads green there and on the hero tile
// rather than diverging across the same report.
function accuracyToneFromPct(pct) {
  if (pct == null) return null;
  if (pct >= 75) return 'good';
  if (pct >= 50) return 'ok';
  return 'bad';
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

