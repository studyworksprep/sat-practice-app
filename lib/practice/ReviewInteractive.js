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
import { ConceptTags } from './ConceptTags';
import { DesmosSavedStateButton } from './DesmosSavedStateButton';
import { FlashcardsButton } from './FlashcardsButton';
import { QuestionMapGrid } from './QuestionMapGrid';
import { QuestionNotes } from './QuestionNotes';
import { ReviewTimingBand } from './ReviewTimingBand';
import { ReviewDailyMap } from './ReviewDailyMap';
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

      {/* ---------- Metrics ---------- */}

      <section className={s.metrics}>
        <div className={s.statRow}>
          <StatTile
            label="Accuracy"
            value={accuracyPct == null ? '—' : `${accuracyPct}%`}
            subtitle={accuracyPct == null
              ? 'No attempts'
              : `${metrics.correct} of ${metrics.attempted}`}
            tone={accuracyToneFromPct(accuracyPct)}
          />
          <StatTile
            label="Correct"
            value={metrics.correct}
            subtitle={`of ${metrics.total}`}
          />
          <StatTile
            label="Incorrect"
            value={metrics.attempted - metrics.correct}
            subtitle={metrics.attempted === metrics.total
              ? 'of ' + metrics.total
              : `of ${metrics.attempted} attempted`}
          />
          {metrics.attempted !== metrics.total && (
            <StatTile
              label="Skipped"
              value={metrics.total - metrics.attempted}
              subtitle="not attempted"
            />
          )}
        </div>

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

        {metrics.byDomain.length > 0 && (
          <div className={s.card}>
            <div className={s.sectionLabel}>Accuracy by domain &amp; skill</div>
            <div className={s.domainList}>
              {metrics.byDomain.map((d) => (
                <DomainRow key={d.name} entry={d} />
              ))}
            </div>
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
            {selected.studentAnswer && !isRevealed && (
              <span className={s.answerHint}>
                Your answer:{' '}
                <strong>
                  {selected.studentAnswer.selectedOptionId
                    ?? selected.studentAnswer.responseText
                    ?? '—'}
                </strong>
              </span>
            )}
            {isMath && (
              <FloatingCalculator
                storageKey={`desmos:review:session:${sessionMeta.sessionId}`}
                onCalcReady={(c) => { calcRef.current = c; }}
              />
            )}
            {showSavedStateBtn && (
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
                className={selected.studentAnswer.isCorrect
                  ? s.resultBadgeCorrect
                  : s.resultBadgeWrong}
              >
                {selected.studentAnswer.isCorrect ? 'Correct' : 'Incorrect'}
              </span>
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

function StatTile({ label, value, subtitle, tone }) {
  const cls = [s.statTile, tone ? s[`statTile_${tone}`] : null]
    .filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      {subtitle && <div className={s.statSubtitle}>{subtitle}</div>}
    </div>
  );
}

// Score bands run 1–7. Color buckets per spec: 1–3 green (easy),
// 4–5 yellow (medium), 6–7 red (hard). The "Band {n}" label
// disambiguates within each bucket.
const BAND_TONE = {
  1: 'diffEasy', 2: 'diffEasy', 3: 'diffEasy',
  4: 'diffMed', 5: 'diffMed',
  6: 'diffHard', 7: 'diffHard',
};

function ScoreBandTile({ entry }) {
  const pct = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : null;
  const label = `Band ${entry.scoreBand}`;
  const toneCls = BAND_TONE[entry.scoreBand];
  return (
    <div className={`${s.diffTile} ${toneCls ? s[toneCls] : ''}`}>
      <div className={s.diffLabel}>{label}</div>
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

function DomainRow({ entry }) {
  const pct = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : null;
  return (
    <div className={s.domainRow}>
      <div className={s.domainHeader}>
        <div className={s.domainName}>{entry.name}</div>
        <div className={s.domainStats}>
          <span className={accuracyPctClass(pct)}>
            {pct == null ? '—' : `${pct}%`}
          </span>
          <span className={s.domainCount}>
            {entry.correct} / {entry.total}
          </span>
        </div>
      </div>
      <div className={s.domainBar}>
        <div
          className={s.domainBarFill}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
      {entry.skills.length > 0 && (
        <ul className={s.skillList}>
          {entry.skills.map((sk) => {
            const skPct = sk.total > 0 ? Math.round((sk.correct / sk.total) * 100) : null;
            return (
              <li key={sk.name} className={s.skillRow}>
                <span className={s.skillName}>{sk.name}</span>
                <span className={s.skillStats}>
                  <span className={accuracyPctClass(skPct)}>
                    {skPct == null ? '—' : `${skPct}%`}
                  </span>
                  <span className={s.skillCount}>
                    {sk.correct}/{sk.total}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function accuracyPctClass(pct) {
  if (pct == null) return s.pctNeutral;
  if (pct >= 80) return s.pctGood;
  if (pct >= 50) return s.pctOk;
  return s.pctBad;
}

function accuracyToneFromPct(pct) {
  if (pct == null) return null;
  if (pct >= 80) return 'good';
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

