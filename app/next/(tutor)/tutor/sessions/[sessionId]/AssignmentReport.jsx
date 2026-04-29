// Tutor-facing assignment report. The teacher's view of a
// student's session — the lay-out is top-to-bottom scannable
// (vs. the per-question pivot in ReviewInteractive that students
// see) so a tutor can run a review lesson straight from the page.
//
// Sections, in order:
//   1. Header (assignment title, student, completion meta)
//   2. Stat strip (score, accuracy, time, struggling skills)
//   3. By-domain table with skill breakdowns
//   4. By-difficulty pills
//   5. Prioritized review (wrong + skipped first), expandable
//      to show the stem, both answers, and the rationale inline
//   6. Full question list (collapsed by default for skim)
//
// The data props mirror buildSessionReview's output so this
// component is a drop-in alternative to ReviewInteractive in the
// tutor tree.

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { CorrectIcon, IncorrectIcon, MarkedIcon } from '@/lib/ui/icons';
import s from './AssignmentReport.module.css';

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
  perQuestionHref = null,
}) {
  // Wrong + skipped first; correct ones tucked behind a toggle so
  // the reviewing tutor doesn't have to scroll past them. Items
  // missing from the bank land in "Wrong" since we can't show the
  // student's answer either way.
  const incorrectItems = useMemo(
    () => items.filter((it) => it.status !== 'correct'),
    [items],
  );
  const correctItems = useMemo(
    () => items.filter((it) => it.status === 'correct'),
    [items],
  );

  const [expanded, setExpanded] = useState(() => new Set());
  const [showCorrect, setShowCorrect] = useState(false);

  function toggle(position) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  }

  function expandAll(targets) {
    setExpanded(new Set(targets.map((it) => it.position)));
  }
  function collapseAll() {
    setExpanded(new Set());
  }

  const sessionDate = formatSessionDate(sessionMeta.createdAt);
  const accuracyPct = metrics.accuracy == null
    ? null
    : Math.round(metrics.accuracy * 100);

  const totalMs = timing?.totalMs ?? 0;
  const medianMs = timing?.medianMs ?? 0;
  const measuredCount = timing?.measuredCount ?? 0;

  // Skills that the student missed at least one question on,
  // ordered by miss count desc. Drives the small "weak spots"
  // pill row at the top of the by-domain section.
  const weakSkills = useMemo(() => buildWeakSkills(metrics), [metrics]);

  return (
    <main className={s.container}>
      {backHref && (
        <Link href={backHref} className={s.breadcrumb}>{backLabel}</Link>
      )}

      <header className={s.header}>
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
      </header>

      {/* ---------- Score strip ---------- */}
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

      {/* ---------- By-domain ---------- */}
      <section className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.h2}>By domain</h2>
          <p className={s.cardHint}>
            Where the work landed and where to focus the review.
            Skills under each domain are sorted by accuracy ascending.
          </p>
        </div>

        {weakSkills.length > 0 && (
          <div className={s.weakRow}>
            <span className={s.weakLabel}>Weak spots</span>
            {weakSkills.map((sk) => (
              <span key={sk.name} className={s.weakPill}>
                {sk.name}
                <span className={s.weakPillCount}>{sk.wrong}</span>
              </span>
            ))}
          </div>
        )}

        <div className={s.domainList}>
          {metrics.byDomain.map((d) => {
            const pct =
              d.total > 0 ? Math.round((d.correct / d.total) * 100) : null;
            return (
              <div key={d.name} className={s.domainRow}>
                <div className={s.domainHead}>
                  <span className={s.domainName}>{d.name}</span>
                  <span className={s.domainCount}>
                    {d.correct} / {d.total}
                    {pct != null && (
                      <span className={`${s.domainPct} ${s[`tone_${accuracyTone(pct)}`] ?? ''}`}>
                        {' '}{pct}%
                      </span>
                    )}
                  </span>
                </div>
                <div className={s.domainBar}>
                  <div
                    className={`${s.domainBarFill} ${s[`barFill_${accuracyTone(pct)}`] ?? ''}`}
                    style={{ width: pct == null ? 0 : `${pct}%` }}
                  />
                </div>
                {d.skills.length > 0 && (
                  <ul className={s.skillList}>
                    {[...d.skills]
                      .sort((a, b) => skillRank(a) - skillRank(b))
                      .map((sk) => {
                        const sPct =
                          sk.total > 0 ? Math.round((sk.correct / sk.total) * 100) : null;
                        return (
                          <li key={sk.name} className={s.skillRow}>
                            <span className={s.skillName}>{sk.name}</span>
                            <span className={s.skillStat}>
                              {sk.correct}/{sk.total}
                              {sPct != null && (
                                <span className={`${s.skillPct} ${s[`tone_${accuracyTone(sPct)}`] ?? ''}`}>
                                  {' · '}{sPct}%
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

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

      {/* ---------- Wrong + skipped review ---------- */}
      <section className={s.card}>
        <div className={s.cardHead}>
          <div className={s.cardHeadMain}>
            <h2 className={s.h2}>Review queue</h2>
            <p className={s.cardHint}>
              Every wrong or skipped question, in order. Click any
              row to expand the stem, both answers, and the rationale
              inline — designed for screen-share during a review
              lesson.
            </p>
          </div>
          {incorrectItems.length > 0 && (
            <div className={s.cardHeadActions}>
              <button
                type="button"
                className={s.linkBtn}
                onClick={() => expandAll(incorrectItems)}
              >
                Expand all
              </button>
              <span className={s.dot}>·</span>
              <button
                type="button"
                className={s.linkBtn}
                onClick={collapseAll}
              >
                Collapse all
              </button>
            </div>
          )}
        </div>

        {incorrectItems.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyTitle}>Clean sweep.</div>
            <div className={s.emptyBody}>
              Every question was answered correctly. Skim the full
              list below if you want to discuss reasoning.
            </div>
          </div>
        ) : (
          <ul className={s.reviewList}>
            {incorrectItems.map((it) => (
              <ReviewRow
                key={it.position}
                item={it}
                expanded={expanded.has(it.position)}
                onToggle={() => toggle(it.position)}
                perQuestionHref={perQuestionHref}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ---------- All questions (collapsed by default) ---------- */}
      <section className={s.card}>
        <div className={s.cardHead}>
          <div className={s.cardHeadMain}>
            <h2 className={s.h2}>All questions</h2>
            <p className={s.cardHint}>
              {showCorrect
                ? 'Including correct answers — click any row to expand.'
                : 'Only the questions the student missed are shown above. Reveal correct answers if you want a full walkthrough.'}
            </p>
          </div>
          <div className={s.cardHeadActions}>
            <button
              type="button"
              className={s.linkBtn}
              onClick={() => setShowCorrect((v) => !v)}
            >
              {showCorrect ? 'Hide correct' : `Show correct (${correctItems.length})`}
            </button>
          </div>
        </div>

        {showCorrect && (
          correctItems.length === 0 ? (
            <div className={s.empty}>
              <div className={s.emptyBody}>No correct answers in this session.</div>
            </div>
          ) : (
            <ul className={s.reviewList}>
              {correctItems.map((it) => (
                <ReviewRow
                  key={it.position}
                  item={it}
                  expanded={expanded.has(it.position)}
                  onToggle={() => toggle(it.position)}
                  perQuestionHref={perQuestionHref}
                />
              ))}
            </ul>
          )
        )}
      </section>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function ReviewRow({ item, expanded, onToggle, perQuestionHref }) {
  const status = item.status; // 'correct' | 'incorrect' | 'unanswered'
  const Icon =
    status === 'correct' ? CorrectIcon
    : status === 'incorrect' ? IncorrectIcon
    : MarkedIcon;
  const statusLabel =
    status === 'correct' ? 'Correct'
    : status === 'incorrect' ? 'Wrong'
    : 'Unanswered';
  const statusClass =
    status === 'correct' ? s.statusCorrect
    : status === 'incorrect' ? s.statusWrong
    : s.statusSkipped;

  return (
    <li className={s.reviewItem}>
      <button
        type="button"
        className={s.reviewSummary}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className={s.reviewOrdinal}>{item.position + 1}</span>
        <span className={`${s.reviewStatus} ${statusClass}`}>
          <Icon size={14} />
          {statusLabel}
        </span>
        <span className={s.reviewTitle}>
          {item.taxonomy?.skill_name ?? item.taxonomy?.domain_name ?? 'Question'}
        </span>
        <span className={s.reviewMeta}>
          {item.taxonomy?.difficulty != null && (
            <span className={s.reviewMetaPill}>
              {DIFF_LABEL[item.taxonomy.difficulty] ?? `D${item.taxonomy.difficulty}`}
            </span>
          )}
          {item.studentAnswer?.timeSpentMs != null && (
            <span className={s.reviewMetaPill}>
              {formatDuration(item.studentAnswer.timeSpentMs)}
            </span>
          )}
        </span>
        <span className={s.reviewChevron} aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <div className={s.reviewBody}>
          {item.missing ? (
            <div className={s.reviewMissing}>
              This question is no longer in the bank, so the stem
              and rationale aren&apos;t available.
            </div>
          ) : (
            <>
              <QuestionRenderer
                mode="review"
                layout={item.layout ?? 'single'}
                question={item}
                selectedOptionId={item.studentAnswer?.selectedOptionId ?? null}
                responseText={item.studentAnswer?.responseText ?? ''}
                result={{
                  isCorrect: item.studentAnswer?.isCorrect ?? null,
                  correctOptionId: item.reveal.correctOptionId,
                  correctAnswerDisplay: item.reveal.correctAnswerDisplay,
                  rationaleHtml: item.reveal.rationaleHtml,
                }}
              />
              {perQuestionHref && (
                <div className={s.reviewFooter}>
                  <Link
                    href={perQuestionHref}
                    className={s.reviewDeepLink}
                  >
                    Open in interactive review →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

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

function buildWeakSkills(metrics) {
  // Flatten skills across domains, surface the ones with at least
  // one wrong answer, sort by wrong count desc and cap at 6 so the
  // pill row stays readable on one line.
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

function skillRank(sk) {
  if (sk.total <= 0) return Number.POSITIVE_INFINITY;
  return sk.correct / sk.total;
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

function formatDuration(ms) {
  if (!ms || ms < 1000) return ms ? '<1s' : '';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${s}s`;
  if (r === 0) return `${m}m`;
  return `${m}m ${r}s`;
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
