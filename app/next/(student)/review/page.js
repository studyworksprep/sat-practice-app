// Student → Review. Pre-test study surface.
//
// The Review tab is for the days leading up to the test: "I have
// ten days; what should I do?" The page is the gathering point
// for everything review-related — active drill tools and passive
// re-reading both live here.
//
// Active drills (top of page, highest-leverage):
//   1. Common errors — skills where the student has missed the
//      most questions, with a one-click drill per skill.
//   2. Weak questions drill — a mixed drill of the student's
//      weakest questions across every skill, picked by the Smart
//      Review priority formula (wrong now + historically bad +
//      stale + hard), ported to the v2 attempts table.
//
// Review materials (passive re-reading of saved notes):
//   3. Review notes      → /review/notes      (long-scroll reader)
//   4. Review error log  → /review/error-log  (entry beside question)
//   5. Review flashcards → /notes/flashcards  (set picker → flip flow)
//
// If the student has set a target SAT date on their profile
// (profiles.sat_test_date), a countdown banner pins to the top.
//
// The note-style cards link out to surfaces that live under either
// /review/* (study modes) or /notes/* (manage hubs); the cards
// surface the relevant counts so the student knows how much
// material is waiting.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { fetchAll } from '@/lib/supabase/fetchAll';
import {
  buildWeakQueue,
  commonErrorsFromAttempts,
  resolveQuestionV2Meta,
} from '@/lib/practice/weak-queue';
import { StudyCountdown } from '@/lib/practice/StudyCountdown';
import { BookOpenIcon, LayersIcon, NotesIcon, SparklesIcon, TargetIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { createWeakQueueDrill, createSkillDrill } from './actions';
import { WeakQueueLauncher } from './WeakQueueLauncher';
import { SkillDrillButton } from './SkillDrillButton';
import s from './Review.module.css';

export const dynamic = 'force-dynamic';

// Top-N skills shown on the Common Errors card.
const COMMON_ERRORS_TOP_N = 3;

export default async function StudentReviewPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // Parallel: extended profile (for sat_test_date), the scored
  // weak queue, raw attempts + question meta for the Common Errors
  // aggregation, plus rollup counts for the three review-materials
  // cards (notes, error log, flashcards).
  const [
    { data: extendedProfile },
    weakQueue,
    attemptsRaw,
    { data: flashcardSets },
    { count: errorNotesCount },
    { count: studentNotesCount },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('sat_test_date')
      .eq('id', user.id)
      .maybeSingle(),
    buildWeakQueue(supabase, user.id),
    fetchAll((from, to) =>
      supabase
        .from('attempts')
        .select('question_id, is_correct, created_at')
        .eq('user_id', user.id)
        .range(from, to),
    ),
    supabase
      .from('flashcard_sets')
      .select('id, name, is_default')
      .eq('user_id', user.id)
      .order('name', { ascending: true }),
    // Error-log count matches loadErrorNotes (SAT-only today; PR 4
    // will branch the join target).
    supabase
      .from('question_error_notes')
      .select('question_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('test_type', 'sat'),
    // Student-notes count matches the cross-test notes hub (§3.4) —
    // intentionally unfiltered.
    supabase
      .from('student_notes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ]);

  // Common Errors aggregation: reuse the question meta we'd need
  // anyway by grabbing the distinct question ids out of attempts
  // and looking them up once. The helper translates v1-era
  // attempt question_ids through question_id_map so legacy-only
  // students' wrong questions resolve correctly.
  const attemptedQids = Array.from(
    new Set(attemptsRaw.map((a) => a.question_id)),
  );
  const metaById = await resolveQuestionV2Meta(
    supabase,
    attemptedQids,
    'id, skill_name, domain_name, is_published, is_broken, deleted_at',
  );

  const commonErrors = commonErrorsFromAttempts(attemptsRaw, metaById)
    .filter((row) => row.wrong > 0)
    .slice(0, COMMON_ERRORS_TOP_N);

  // Flashcard rollup. The cards-per-set join is one extra query;
  // cheap, but skippable when the student has no sets yet.
  let flashcardTotal = 0;
  const setIds = (flashcardSets ?? []).map((sOne) => sOne.id);
  if (setIds.length > 0) {
    const { count } = await supabase
      .from('flashcards')
      .select('*', { count: 'exact', head: true })
      .in('set_id', setIds);
    flashcardTotal = count ?? 0;
  }

  const queueCount = weakQueue.length;

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Review</div>
        <h1 className={s.h1}>Review</h1>
        <p className={s.sub}>
          A focused study surface for the days before your test.
          Drill your weakest questions, fix your most common errors,
          and keep your flashcards fresh.
        </p>
      </header>

      <StudyCountdown isoDate={extendedProfile?.sat_test_date ?? null} />

      {/* ---------- Review materials ---------- */}
      {/* Quick links into the three review surfaces — usually the
          first thing a student wants to do when they land here.
          The active drills (Common errors, Weak questions) live
          below for the days they want to grind new attempts. */}

      <section className={s.materialsSection}>
        <div className={s.materialsHeader}>
          <h2 className={s.materialsTitle}>Review materials</h2>
          <p className={s.materialsHint}>
            Re-read your saved notes, error log, and flashcards.
          </p>
        </div>
        <div className={s.materialsGrid}>
          <MaterialCard
            href="/review/notes"
            icon={BookOpenIcon}
            palette="cyan"
            title="Review notes"
            count={studentNotesCount ?? 0}
            countLabel={(studentNotesCount ?? 0) === 1 ? 'note' : 'notes'}
            hint="Scroll your saved notes, filtered by subject, domain, or skill."
            emptyHint="No notes yet. Start one from any question."
          />
          <MaterialCard
            href="/review/error-log"
            icon={NotesIcon}
            palette="amber"
            title="Review error log"
            count={errorNotesCount ?? 0}
            countLabel={(errorNotesCount ?? 0) === 1 ? 'entry' : 'entries'}
            hint="Each entry alongside the question you got wrong."
            emptyHint="No error log entries yet. Jot one in any session."
          />
          <MaterialCard
            href="/notes/flashcards"
            icon={LayersIcon}
            palette="violet"
            title="Review flashcards"
            count={flashcardTotal}
            countLabel={flashcardTotal === 1 ? 'card' : 'cards'}
            hint={
              (flashcardSets ?? []).length > 0
                ? `Across ${(flashcardSets ?? []).length} set${(flashcardSets ?? []).length === 1 ? '' : 's'}.`
                : 'Pick a set to start a flip-and-rate review.'
            }
            emptyHint="No flashcards yet. Create a set to get started."
          />
        </div>
      </section>

      {/* ---------- Common errors ---------- */}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>
              <IconTile icon={SparklesIcon} palette="amber" size="md" />
              <span>Common errors</span>
            </div>
            <div className={s.cardHint}>
              Skills where you&apos;ve missed the most. Click one
              to drill that skill only.
            </div>
          </div>
          <span className={s.cardTag}>
            {commonErrors.length} skill{commonErrors.length === 1 ? '' : 's'}
          </span>
        </div>
        {commonErrors.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyTitle}>No errors to review yet.</div>
            <div className={s.emptyBody}>
              As you answer questions across practice and assignments,
              the skills where you slip up show up here.
            </div>
          </div>
        ) : (
          <ul className={s.skillList}>
            {commonErrors.map((row) => (
              <li key={row.skill_name} className={s.skillRow}>
                <div className={s.skillInfo}>
                  <div className={s.skillName}>{row.skill_name}</div>
                  <div className={s.skillMeta}>
                    {row.domain_name && (
                      <span className={s.skillDomain}>{row.domain_name}</span>
                    )}
                    <span className={s.skillStats}>
                      {row.wrong} wrong of {row.total} attempts ·{' '}
                      {Math.round(row.accuracy * 100)}% accuracy
                    </span>
                  </div>
                  <div className={s.skillBar}>
                    <div
                      className={s.skillBarFill}
                      style={{ width: `${Math.round(row.accuracy * 100)}%` }}
                    />
                  </div>
                </div>
                <SkillDrillButton
                  skillName={row.skill_name}
                  createAction={createSkillDrill}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Weak questions drill ---------- */}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>
              <IconTile icon={TargetIcon} palette="cyan" size="md" />
              <span>Weak questions drill</span>
            </div>
            <div className={s.cardHint}>
              Your trickiest questions across every skill, ordered
              by how recently you missed them and how hard they are.
              Answers and rationales reveal at the end of each
              question.
            </div>
          </div>
          <span className={s.cardTag}>
            {queueCount.toLocaleString()} in queue
          </span>
        </div>
        {queueCount === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyTitle}>Nothing in your queue yet.</div>
            <div className={s.emptyBody}>
              Anything you get wrong across practice, assignments,
              and tests lands here automatically.
            </div>
          </div>
        ) : (
          <WeakQueueLauncher
            queueCount={queueCount}
            createAction={createWeakQueueDrill}
          />
        )}
      </section>

    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function MaterialCard({ href, icon: Icon, palette, title, count, countLabel, hint, emptyHint }) {
  const isEmpty = count === 0;
  return (
    <Link href={href} className={s.materialCard}>
      <div className={s.materialCardTop}>
        <IconTile icon={Icon} palette={palette} size="md" />
        <span className={s.materialCardCount}>
          {count.toLocaleString()} {countLabel}
        </span>
      </div>
      <div className={s.materialCardTitle}>{title}</div>
      <div className={s.materialCardHint}>{isEmpty ? emptyHint : hint}</div>
      <div className={s.materialCardCta}>Open →</div>
    </Link>
  );
}

