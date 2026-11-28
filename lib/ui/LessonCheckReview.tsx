'use client';

import { useState } from 'react';
import HtmlBlock from '@/components/HtmlBlock';
import { MathText } from './MathText';
import s from './LessonCheckReview.module.css';
import type { buildCheckReview, ReviewAnswer, ReviewQuestion, ReviewVersion } from '@/lib/lesson/check-review.mjs';

type Review = ReturnType<typeof buildCheckReview>;
type Row = Review['rows'][number];

const GROUPS = [
  ['missed', 'Still incorrect'], ['retry', 'Correct after retry'], ['first', 'Correct first try'],
  ['recorded', 'Final result only'], ['unanswered', 'No recorded answer'],
];

function Authored({ value }: { value: string }) {
  if (!value) return null;
  return /<[a-z][\s\S]*?>/i.test(value)
    ? <HtmlBlock html={value} className="prose lesson-prose" imgMaxWidth="100%" />
    : <MathText>{value}</MathText>;
}

function Response({ answer, question }: { answer: ReviewAnswer; question: ReviewQuestion | null }) {
  if (question?.kind === 'desmos') {
    if (!answer.expressions) return <span>Expressions were not recorded.</span>;
    return answer.expressions.length ? <ul className={s.expressions}>{answer.expressions.map((v, i) =>
      <li key={i}><code>{v}</code></li>)}</ul> : <span>No expressions submitted.</span>;
  }
  if (question?.kind === 'choice' && typeof answer.selected === 'number' && Number.isInteger(answer.selected)) {
    const i = answer.selected;
    return <div>{String.fromCharCode(65 + i)}{question.choices[i] != null && <> · <Authored value={question.choices[i]} /></>}</div>;
  }
  return <span className={s.typed}>{answer.selected == null ? 'Answer unavailable' : String(answer.selected)}</span>;
}

function VersionDetails({ version }: { version: ReviewVersion }) {
  const { question: q, answers, saved } = version;
  return <div className={s.version}>
    {q?.passage && <section className={s.context}><strong>{q.passage.title}</strong><Authored value={q.passage.html} /></section>}
    {q?.figure && <figure className={s.figure}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={q.figure.src} alt={q.figure.alt} loading="lazy" />
      {q.figure.caption && <figcaption><Authored value={q.figure.caption} /></figcaption>}
    </figure>}
    {q && <div className={s.prompt}><Authored value={q.prompt} /></div>}
    {q?.instructions && <Authored value={q.instructions} />}
    {!saved && answers.length > 0 && <p className={s.note}>{q
      ? 'This submission predates saved question versions. The wording and choices shown are from the current lesson.'
      : 'The original question wording is unavailable.'}</p>}
    {q && q.choices.length > 0 && <ol className={s.choices} type="A">{q.choices.map((c, i) =>
      <li key={i}><Authored value={c} /></li>)}</ol>}
    {answers.length > 0 && <dl className={s.history}>{answers.map(a =>
      <div key={a.number}><dt>{a.label}</dt><dd><Response answer={a} question={q} />
        {a.correct != null && <span className={a.correct ? s.good : s.miss}>{a.correct ? 'Correct' : 'Incorrect'}</span>}
      </dd></div>)}</dl>}
    {q?.kind === 'choice' && q.correctIndex != null && q.choices[q.correctIndex] != null &&
      <div><strong>Correct answer</strong> · {String.fromCharCode(65 + q.correctIndex)} · <Authored value={q.choices[q.correctIndex]} /></div>}
    {q?.kind === 'numeric' && <p><strong>Accepted answer</strong> · {q.numericAnswer}</p>}
    {q && (answers.some(a => a.revealed) ? q.solution : q.explanation) &&
      <section className={s.explanation}><strong>{answers.some(a => a.revealed) ? 'Worked solution shown' : 'Explanation'}</strong>
        <div><Authored value={answers.some(a => a.revealed) ? q.solution : q.explanation} /></div></section>}
  </div>;
}

function Check({ row, open, toggle }: { row: Row; open: boolean; toggle: () => void }) {
  const desmos = row.question?.kind === 'desmos';
  const latest = row.versions.at(-1)?.answers.at(-1);
  let result = GROUPS.find(([key]) => key === row.outcome)?.[1] ?? 'Recorded answer';
  if (row.outcome === 'recorded') result = 'Final answer correct';
  if (desmos && row.attempted) result = row.finalCorrect ? 'Check passed' : 'Check not passed';
  if (latest?.revealed) result = 'Worked solution shown';
  return <div className={s.row}>
    <button type="button" className={s.rowButton} aria-expanded={open} onClick={toggle}>
      <span className={s.step}>Step {row.stepNumber}</span>
      <span className={s.label}><Authored value={String(row.question?.prompt || row.label).replace(/<[^>]*>/g, ' ')} /></span>
      <span className={s.status}>{result}</span><span aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    {open && <div className={s.detail}>{row.versions.map((v, i) => <VersionDetails key={i} version={v} />)}</div>}
  </div>;
}

export function LessonCheckReview({ review, tutor = false, startMissed = false }: { review: Review; tutor?: boolean; startMissed?: boolean }) {
  const missed = review.rows.filter(r => r.blockType === 'check' && ['missed', 'retry'].includes(r.outcome));
  const [view, setView] = useState(startMissed && missed.length ? 'missed' : tutor ? 'grouped' : 'all');
  const [expanded, setExpanded] = useState<string | null>(startMissed ? missed[0]?.blockId ?? null : null);
  const checks = review.rows.filter(r => r.blockType === 'check');
  const activities = review.rows.filter(r => r.blockType === 'desmos_interactive');
  const firstTry = checks.filter(r => r.firstTryCorrect != null);
  function changeView(next: string) {
    setView(next);
    setExpanded(next === 'missed' ? missed[0]?.blockId ?? null : null);
  }
  function section(rows: Row[], title: string) {
    if (!rows.length) return null;
    return <section key={title || 'checks'} className={s.section}>
      {title && <h3>{title} <span>{rows.length}</span></h3>}
      {rows.map(row => <Check key={row.blockId} row={row} open={expanded === row.blockId}
        toggle={() => setExpanded(expanded === row.blockId ? null : row.blockId)} />)}
    </section>;
  }
  return <section className={s.review}>
    <h2>Question review</h2>
    {firstTry.length > 0 && <p className={s.score}><strong>{firstTry.filter(r => r.firstTryCorrect).length} of {firstTry.length}</strong> right on the first try</p>}
    {checks.length > 0 && <div className={s.controls} aria-label="Question filters">
      {(tutor ? [['grouped', 'By outcome'], ['all', 'All checks']] :
        [['all', 'All checks'], ...(missed.length ? [['missed', 'Review missed checks (' + missed.length + ')']] : [])])
        .map(([key, text]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => changeView(key)}>{text}</button>)}
    </div>}
    {view === 'grouped' ? GROUPS.map(([key, title]) => section(checks.filter(r => r.outcome === key), title))
      : section(view === 'missed' ? missed : checks, '')}
    {view !== 'missed' && section(activities, 'Desmos activities')}
    {view !== 'missed' && section(review.archived, 'Earlier lesson version')}
    {!review.rows.length && !review.archived.length && <p>This lesson has no recorded checks to review.</p>}
  </section>;
}
