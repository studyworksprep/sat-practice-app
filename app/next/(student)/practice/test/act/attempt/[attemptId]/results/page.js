// ACT practice-test results page. Reads the cached scores from
// act_practice_test_attempts (written by finalizeActPracticeTest
// in app/next/(student)/practice/tests/actions.ts) and shows the
// per-section breakdown plus composite. Question-by-question
// review lives on the unified /practice/review/<sessionId> page
// (PR 5); this page surfaces the score summary + a link.
//
// Degrades gracefully when act_score_conversion is empty on prod:
// the cached scaled fields are null, so we render the raw correct
// count per section with a "scaled scores pending" inline note.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { sectionLabel } from '@/lib/practice/act-taxonomy';
import { formatDate } from '@/lib/formatters';
import s from './ActResults.module.css';

export const dynamic = 'force-dynamic';

const SECTIONS = ['english', 'math', 'reading', 'science'];

export default async function ActPracticeTestResultsPage({ params }) {
  const { attemptId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // RLS pins the attempt to its owner; a stray attemptId from a
  // different user returns null. We re-check user_id explicitly so
  // the failure is a clean notFound rather than an attempt to load
  // half the page.
  const { data: attempt } = await supabase
    .from('act_practice_test_attempts')
    .select(
      'id, user_id, source_test, status, started_at, finished_at, ' +
      'english_scaled, math_scaled, reading_scaled, science_scaled, ' +
      'composite_score, practice_session_id',
    )
    .eq('id', attemptId)
    .maybeSingle();
  if (!attempt) notFound();
  if (attempt.user_id !== user.id) notFound();

  // Pull the linked practice_session so we can compute raw correct
  // per section. Session question_ids + attempts (the per-question
  // rows in act_attempts) give us raw N / total per section even
  // when the cached scaled score is null.
  let questionIds = [];
  let sessionCreatedAt = null;
  if (attempt.practice_session_id) {
    const { data: session } = await supabase
      .from('practice_sessions')
      .select('id, question_ids, created_at')
      .eq('id', attempt.practice_session_id)
      .maybeSingle();
    if (session) {
      questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];
      sessionCreatedAt = session.created_at ?? null;
    }
  }

  const [{ data: meta }, { data: attempts }] = await Promise.all([
    questionIds.length > 0
      ? supabase
          .from('act_questions')
          .select('id, section')
          .in('id', questionIds)
      : Promise.resolve({ data: [] }),
    questionIds.length > 0
      ? supabase
          .from('act_attempts')
          .select('question_id, is_correct, created_at')
          .eq('user_id', user.id)
          .in('question_id', questionIds)
          .gte('created_at', sessionCreatedAt ?? '1970-01-01T00:00:00Z')
      : Promise.resolve({ data: [] }),
  ]);

  const sectionByQid = new Map();
  for (const r of meta ?? []) sectionByQid.set(r.id, r.section);

  // First-attempt wins per question, mirroring the runner +
  // finalize logic. Bucket the per-question first attempts onto
  // their section to compute raw correct + raw total.
  const firstByQid = new Map();
  for (const a of (attempts ?? []).slice().sort((x, y) =>
    (x.created_at ?? '').localeCompare(y.created_at ?? ''),
  )) {
    if (!firstByQid.has(a.question_id)) firstByQid.set(a.question_id, a);
  }

  const sectionStats = Object.fromEntries(
    SECTIONS.map((sec) => [sec, { total: 0, correct: 0 }]),
  );
  for (const qid of questionIds) {
    const sec = sectionByQid.get(qid);
    if (!sec || !(sec in sectionStats)) continue;
    sectionStats[sec].total += 1;
    if (firstByQid.get(qid)?.is_correct) sectionStats[sec].correct += 1;
  }

  // Only render rows for sections that actually have questions in
  // this attempt. Today's seeded forms are single-section, so this
  // typically yields one row.
  const sectionRows = SECTIONS
    .filter((sec) => sectionStats[sec].total > 0)
    .map((sec) => ({
      section: sec,
      label: sectionLabel(sec),
      raw: sectionStats[sec],
      scaled: attempt[`${sec}_scaled`] ?? null,
    }));

  const anyScaledMissing = sectionRows.some((r) => r.scaled == null);

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>ACT practice test</div>
        <h1 className={s.h1}>{attempt.source_test}</h1>
        <p className={s.sub}>
          Finished {formatDate(attempt.finished_at)}
        </p>
      </header>

      {Number.isFinite(attempt.composite_score) ? (
        <section className={s.compositeCard}>
          <div className={s.compositeLabel}>Composite</div>
          <div className={s.compositeValue}>{attempt.composite_score}</div>
          <div className={s.compositeSub}>Out of 36 · rounded average of the four section scales</div>
        </section>
      ) : sectionRows.length < 4 ? (
        <section className={s.compositeCard}>
          <div className={s.compositeLabel}>Composite</div>
          <div className={s.compositeValueMissing}>—</div>
          <div className={s.compositeSub}>
            Composite is the average of all four section scales. This
            attempt covered {sectionRows.length === 1 ? 'one section' : `${sectionRows.length} sections`},
            so the composite isn&apos;t reported.
          </div>
        </section>
      ) : null}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.h2}>Section scores</div>
        </div>
        <div className={s.sectionGrid}>
          {sectionRows.map((row) => (
            <div key={row.section} className={s.sectionTile}>
              <div className={s.sectionTileLabel}>{row.label}</div>
              <div className={s.sectionTileScaled}>
                {row.scaled != null ? row.scaled : '—'}
              </div>
              <div className={s.sectionTileRaw}>
                {row.raw.correct} of {row.raw.total} correct
              </div>
              {row.scaled == null && (
                <div className={s.scaledPending}>
                  Scaled score pending
                </div>
              )}
            </div>
          ))}
        </div>
        {anyScaledMissing && (
          <div className={s.scaledNote}>
            Scaled scores are computed from the official ACT raw-to-scaled
            conversion tables, which haven&apos;t been seeded yet for the
            forms currently available. Raw counts above are accurate.
          </div>
        )}
      </section>

      <section className={s.card}>
        <div className={s.h2}>Review</div>
        <p className={s.reviewBody}>
          The question-by-question review (rationales, your answers,
          time per question) lives on the unified review page.
        </p>
        {attempt.practice_session_id && (
          <Link
            className={s.reviewLink}
            href={`/practice/review/${attempt.practice_session_id}`}
          >
            Open review report →
          </Link>
        )}
      </section>
    </main>
  );
}
