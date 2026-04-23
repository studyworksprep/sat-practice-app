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

import { useState } from 'react';
import Link from 'next/link';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { FloatingCalculator } from '@/lib/ui/FloatingCalculator';
import s from './ReviewInteractive.module.css';

// Same math-domain set the practice runner uses — only math
// items get the floating calculator button.
const CALCULATOR_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

/**
 * @param {object} props
 * @param {{sessionId: string, createdAt: string, mode: string}} props.sessionMeta
 * @param {Array} props.items - per-position question view models (see page.js)
 * @param {object} props.metrics - pre-aggregated session metrics
 */
export function ReviewInteractive({ sessionMeta, items, metrics }) {
  const [selectedPosition, setSelectedPosition] = useState(0);
  const [revealed, setRevealed] = useState(() => new Set());

  const selected = items[selectedPosition] ?? items[0];
  const isRevealed = revealed.has(selected.position);

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
        <div className={s.eyebrow}>Practice session report</div>
        <h1 className={s.h1}>{sessionDate}</h1>
        <div className={s.subtitle}>
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

        {metrics.byDifficulty.length > 0 && (
          <div className={s.card}>
            <div className={s.sectionLabel}>Accuracy by difficulty</div>
            <div className={s.diffRow}>
              {metrics.byDifficulty.map((d) => (
                <DifficultyTile key={d.difficulty} entry={d} />
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
      </section>

      {/* ---------- Question map ---------- */}

      <section className={s.card}>
        <div className={s.sectionLabel}>Question map — click any question to review it</div>
        <div className={s.mapGrid} role="list">
          {items.map((it) => {
            const isCurrent = it.position === selectedPosition;
            const isRev = revealed.has(it.position);
            const cls = [
              s.mapItem,
              s[`mapItem_${it.status}`],
              isCurrent ? s.mapItemActive : null,
              isRev ? s.mapItemRevealed : null,
            ].filter(Boolean).join(' ');
            return (
              <button
                key={it.position}
                type="button"
                className={cls}
                onClick={() => setSelectedPosition(it.position)}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={`Question ${it.position + 1}, ${it.status}`}
              >
                <span className={s.mapNum}>{it.position + 1}</span>
                {it.status === 'correct' && (
                  <span className={s.mapMark} aria-hidden="true">✓</span>
                )}
                {it.status === 'incorrect' && (
                  <span className={s.mapMark} aria-hidden="true">✕</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- Selected question ---------- */}

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
                {selected.taxonomy.difficulty && ` · difficulty ${selected.taxonomy.difficulty}`}
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
            {CALCULATOR_DOMAINS.has(selected?.taxonomy?.domain_code ?? '') && (
              <FloatingCalculator
                storageKey={`desmos:review:session:${sessionMeta.sessionId}`}
              />
            )}
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
          />
        )}
      </section>

      <div className={s.footer}>
        <Link href="/practice/history" className={s.footerLink}>
          ← All practice sessions
        </Link>
        <Link href="/practice/start" className={s.footerLinkPrimary}>
          Start another session →
        </Link>
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

const DIFF_LABELS = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Very hard', 5: 'Extreme' };
const DIFF_CLASS = {
  1: 'diffEasy', 2: 'diffMed', 3: 'diffHard',
  4: 'diffVHard', 5: 'diffExtreme',
};

function DifficultyTile({ entry }) {
  const pct = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : null;
  const label = DIFF_LABELS[entry.difficulty] ?? `Difficulty ${entry.difficulty}`;
  const toneCls = DIFF_CLASS[entry.difficulty];
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
