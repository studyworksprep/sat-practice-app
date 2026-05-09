// Cohort assignment report. Peer to AssignmentReport but renders
// per-question performance across every enrolled student
// (Correct / Incorrect / Omitted with names on hover) instead of
// a single student's answers. Used by the tutor when meeting with
// a group that all completed the same assignment.
//
// Visual vocabulary matches AssignmentReport so the two surfaces
// feel like one product: hero strip, sticky question map,
// per-question detail with QuestionRenderer in 'review' mode.
// What's different:
//   - hero metrics describe the cohort, not one student
//   - the question map cell color reflects cohort outcome
//     ('incorrect' if anyone got it wrong, 'correct' if all
//      attempters got it right, 'unanswered' if nobody attempted)
//   - the per-question detail card has a CohortBreakdown panel
//     instead of a student's answer + result

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { subjectFromDomainCode } from './DomainBreakdownCard';
import { QuestionMapGrid } from './QuestionMapGrid';
import { ReportHero } from './ReportHero';
import { SkillBreakdownCard } from './SkillBreakdownCard';
import s from './GroupAssignmentReport.module.css';

export function GroupAssignmentReport({
  assignment,
  students,
  items,
  metrics,
  backHref,
}) {
  const groups = useMemo(
    () => [{
      key: 'all',
      label: '',
      items: items.map((it) => ({
        id: it.position,
        ordinalLabel: it.position + 1,
        status: it.status,
        difficulty: it.taxonomy?.difficulty ?? null,
        marked: false,
        missing: it.missing,
        ariaLabel: `Question ${it.position + 1}, ${cohortAriaLabel(it.cohort)}`,
      })),
    }],
    [items],
  );

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

  const accuracyPct = metrics.cohortAccuracy == null
    ? null
    : Math.round(metrics.cohortAccuracy * 100);

  // Same shapes the per-student AssignmentReport renders. With
  // total = attempted cells and correct = correct cells, "wrong"
  // here naturally means incorrect attempts (omissions are
  // already excluded), so this surfaces skills the cohort got
  // wrong rather than just skills nobody's attempted yet.
  const weakSkills = useMemo(() => buildWeakSkills(metrics), [metrics]);
  const { rwDomains, mathDomains } = useMemo(
    () => splitDomainsBySubject(metrics.byDomain ?? []),
    [metrics],
  );

  return (
    <main className={s.container}>
      {backHref && (
        <Link href={backHref} className={s.breadcrumb}>← Back to assignment</Link>
      )}

      <header className={s.header}>
        <div className={s.headerMain}>
          <div className={s.eyebrow}>Group report</div>
          <h1 className={s.h1}>{assignment.title}</h1>
          <div className={s.subtitleRow}>
            <span>
              {metrics.totalStudents} student{metrics.totalStudents === 1 ? '' : 's'}
            </span>
            <span className={s.dot}>·</span>
            <span>
              {metrics.completedCount} of {metrics.totalStudents} marked complete
            </span>
            <span className={s.dot}>·</span>
            <span>{metrics.totalQuestions} questions</span>
          </div>
        </div>
      </header>

      <ReportHero
        primary={{
          label: 'Cohort accuracy',
          value: accuracyPct == null ? '—' : `${accuracyPct}%`,
          sub: metrics.cohortDone === 0
            ? 'No attempts yet'
            : `${metrics.cohortCorrect} of ${metrics.cohortDone} attempts correct`,
        }}
        tiles={[
          {
            label: 'Students',
            value: `${metrics.completedCount} / ${metrics.totalStudents}`,
            sub: metrics.totalStudents === 0
              ? 'No students enrolled'
              : `${Math.round(
                  (metrics.completedCount / metrics.totalStudents) * 100,
                )}% complete`,
          },
          {
            label: 'Questions w/ a wrong answer',
            value: `${metrics.wrongQuestionCount} / ${metrics.totalQuestions}`,
            sub:
              metrics.wrongQuestionCount === 0
                ? metrics.cohortDone === 0
                  ? 'Awaiting attempts'
                  : 'Cohort got every attempted question right'
                : 'Worth reviewing together',
            tone:
              metrics.cohortDone === 0
                ? 'neutral'
                : metrics.wrongQuestionCount === 0
                  ? 'good'
                  : metrics.wrongQuestionCount > metrics.totalQuestions / 3
                    ? 'bad'
                    : 'ok',
          },
          {
            label: 'Total attempts',
            value: String(metrics.cohortDone),
            sub:
              metrics.totalQuestions * metrics.totalStudents === 0
                ? '—'
                : `out of ${
                    metrics.totalQuestions * metrics.totalStudents
                  } possible`,
          },
        ]}
      />

      {/* ---------- Group weak spots ----------
           Skills with the most incorrect attempts across the
           cohort. Sorted by wrong-count desc; capped at 6 so the
           strip doesn't sprawl. */}
      {weakSkills.length > 0 && (
        <section className={s.weakCard}>
          <div className={s.weakLabel}>Group weak spots</div>
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

      {/* ---------- By-domain skill breakdown ----------
           One subject card each, RW and Math, with a per-skill row.
           Reuses the same SkillBreakdownCard the per-student report
           uses; here the totals are cohort-wide. */}
      {(rwDomains.length > 0 || mathDomains.length > 0) && (
        <section className={s.cardRow}>
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
        </section>
      )}

      {/* ---------- Cohort accuracy by score band ---------- */}
      {(metrics.byScoreBand ?? []).length > 0 && (
        <section className={s.card}>
          <div className={s.cardHead}>
            <h2 className={s.h2}>By score band</h2>
          </div>
          <div className={s.diffRow}>
            {metrics.byScoreBand
              .filter((d) => d.scoreBand)
              .map((d) => {
                const pct =
                  d.total > 0 ? Math.round((d.correct / d.total) * 100) : null;
                return (
                  <div key={d.scoreBand} className={`${s.diffTile} sw-band-${d.scoreBand}`}>
                    <div className={s.diffLabel}>Band {d.scoreBand}</div>
                    <div className={s.diffValue}>
                      {d.correct} / {d.total}
                    </div>
                    {pct != null && (
                      <div className={s.diffPct}>{pct}%</div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      <div className={s.reviewLayout}>
        <section className={`${s.card} ${s.reviewMapCard}`}>
          <div className={s.cardHead}>
            <div className={s.cardHeadMain}>
              <h2 className={s.h2}>Question map</h2>
              <p className={s.cardHint}>
                Red = at least one student got this wrong.
                Green = every attempter got it right.
                Gray = nobody has attempted it yet. Click a cell
                to open the per-question breakdown.
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
                    <> · diff {selected.taxonomy.difficulty}</>
                  )}
                </span>
              </div>
            </div>

            <CohortBreakdown
              cohort={selected.cohort}
              totalStudents={students.length}
            />

            {selected.missing ? (
              <p className={s.missingNote}>
                This question is no longer available in the question bank.
              </p>
            ) : (
              <QuestionRenderer
                key={`group-${selected.position}-${isRevealed ? 'r' : 'q'}`}
                mode="review"
                layout={selected.layout ?? 'single'}
                question={selected}
                selectedOptionId={null}
                responseText=""
                result={isRevealed ? {
                  isCorrect: null,
                  correctOptionId: selected.reveal.correctOptionId,
                  correctAnswerDisplay: selected.reveal.correctAnswerDisplay,
                  rationaleHtml: selected.reveal.rationaleHtml,
                } : null}
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
        )}
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function CohortBreakdown({ cohort, totalStudents }) {
  const segments = [
    {
      key: 'correct',
      label: 'Correct',
      tone: s.segCorrect,
      people: cohort.correct,
    },
    {
      key: 'incorrect',
      label: 'Incorrect',
      tone: s.segWrong,
      people: cohort.incorrect,
    },
    {
      key: 'omitted',
      label: 'Omitted',
      tone: s.segOmitted,
      people: cohort.omitted,
    },
  ];
  return (
    <div className={s.cohortBreakdown}>
      {segments.map((seg) => (
        <CohortSegment
          key={seg.key}
          label={seg.label}
          tone={seg.tone}
          people={seg.people}
          totalStudents={totalStudents}
        />
      ))}
    </div>
  );
}

function CohortSegment({ label, tone, people, totalStudents }) {
  const [hovered, setHovered] = useState(false);
  const count = people.length;
  return (
    <div
      className={`${s.segment} ${tone}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      tabIndex={0}
      aria-label={
        count === 0
          ? `${label}: 0 of ${totalStudents}`
          : `${label}: ${count} of ${totalStudents}: ${people.map((p) => p.name).join(', ')}`
      }
    >
      <div className={s.segmentLabel}>{label}</div>
      <div className={s.segmentCount}>
        {count}<span className={s.segmentTotal}> / {totalStudents}</span>
      </div>
      {count > 0 && hovered && (
        <div className={s.segmentTooltip} role="tooltip">
          {people.map((p) => (
            <div key={p.id} className={s.segmentTooltipName}>{p.name}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function cohortAriaLabel(cohort) {
  const c = cohort.correct.length;
  const i = cohort.incorrect.length;
  const o = cohort.omitted.length;
  return `${c} correct, ${i} incorrect, ${o} omitted`;
}

// ──────────────────────────────────────────────────────────────
// Mirrors the per-student AssignmentReport helpers. Kept inline
// here rather than shared because we may evolve the cohort
// semantics independently — e.g. a future "show skills with the
// largest gap between cohort accuracy and class average" pivot.

function buildWeakSkills(metrics) {
  const out = [];
  for (const d of metrics.byDomain ?? []) {
    for (const sk of d.skills ?? []) {
      const wrong = (sk.total ?? 0) - (sk.correct ?? 0);
      if (wrong > 0) out.push({ name: sk.name, wrong, total: sk.total });
    }
  }
  out.sort((a, b) => b.wrong - a.wrong || b.total - a.total);
  return out.slice(0, 6);
}

function splitDomainsBySubject(byDomain) {
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
    if (subj === 'MATH') mathDomains.push(entry);
    else rwDomains.push(entry);
  }
  return { rwDomains, mathDomains };
}

function skillRank(sk) {
  if (sk.total <= 0) return Number.POSITIVE_INFINITY;
  return sk.correct / sk.total;
}
