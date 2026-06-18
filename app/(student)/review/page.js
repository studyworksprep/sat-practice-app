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
import {
  buildWeakQueueAct,
  commonErrorsFromActAttempts,
  resolveActQuestionMetaForReview,
} from '@/lib/practice/weak-queue-act';
import { StudyCountdown } from '@/lib/practice/StudyCountdown';
import { BookOpenIcon, LayersIcon, NotesIcon, SparklesIcon, TargetIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import {
  createWeakQueueDrill, createSkillDrill,
  createActWeakQueueDrill, createActCategoryDrill,
} from './actions';
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

  // Parallel: extended profile (for sat_test_date), SAT scored
  // weak queue + raw attempts + question meta, ACT versions of the
  // same, plus rollup counts for the three review-materials cards
  // (notes, error log, flashcards). Error-log count is now both
  // test types combined since the /review/error-log page shows
  // SAT + ACT entries on the same page.
  const [
    { data: extendedProfile },
    weakQueue,
    attemptsRaw,
    weakQueueAct,
    actAttemptsRaw,
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
    buildWeakQueueAct(supabase, user.id),
    fetchAll((from, to) =>
      supabase
        .from('act_attempts')
        .select('question_id, is_correct, created_at')
        .eq('user_id', user.id)
        .range(from, to),
    ),
    supabase
      .from('flashcard_sets')
      .select('id, name, is_default')
      .eq('user_id', user.id)
      .order('name', { ascending: true }),
    // Cross-test error-log count — the /review/error-log page shows
    // both test types together (§3.4 unified review).
    supabase
      .from('question_error_notes')
      .select('question_id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    // Student-notes count is cross-test by design (§3.4 single
    // notes inbox).
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

  // ACT side — same shape (skill_name carries category, domain_name
  // carries section label) so the existing render markup is reused.
  const actAttemptedQids = Array.from(
    new Set(actAttemptsRaw.map((a) => a.question_id)),
  );
  const actMetaById = await resolveActQuestionMetaForReview(
    supabase,
    actAttemptedQids,
  );
  const actCommonErrors = commonErrorsFromActAttempts(actAttemptsRaw, actMetaById)
    .filter((row) => row.wrong > 0)
    .slice(0, COMMON_ERRORS_TOP_N);

  // Whether to show test-type headers. When the student only has
  // data for one test type the page reads cleanly without a header.
  // When both have data, headers disambiguate the two columns of
  // "Common errors" + "Weak questions" cards.
  const hasSatData = commonErrors.length > 0 || weakQueue.length > 0;
  const hasActData = actCommonErrors.length > 0 || weakQueueAct.length > 0;
  const showHeaders = hasSatData && hasActData;

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

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Review</div>
        <h1 className={s.h1}>Review</h1>
        <p className={s.sub}>
          A focused study surface for the days before your test.
          Drill your weakest questions, fix your most common errors,
          and keep your flashcards fresh.{' '}
          <a href="/help/review" style={{ color: 'var(--color-app-accent, #4f46e5)', textDecoration: 'none', fontWeight: 600 }}>
            How to use the Review tab →
          </a>
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

      {/* ---------- SAT review surfaces ---------- */}
      {hasSatData && (
        <>
          {showHeaders && (
            <div className={s.testTypeHeader}>
              <span className={s.testTypeLabel}>SAT</span>
            </div>
          )}
          <ReviewCommonErrors
            commonErrors={commonErrors}
            labelKind="skill"
            createAction={createSkillDrill}
          />
          <ReviewWeakQueue
            queueCount={weakQueue.length}
            createAction={createWeakQueueDrill}
          />
        </>
      )}

      {/* ---------- ACT review surfaces ----------
          Sibling block to the SAT one above. Renders only when the
          student has any ACT data (common errors or a non-empty
          weak queue). When both test types have data, simple test-
          type headers above each block disambiguate them; otherwise
          we hide the header and the surfaces read like the legacy
          single-test layout. */}
      {hasActData && (
        <>
          {showHeaders && (
            <div className={s.testTypeHeader}>
              <span className={s.testTypeLabel}>ACT</span>
            </div>
          )}
          <ReviewCommonErrors
            commonErrors={actCommonErrors}
            labelKind="category"
            createAction={createActCategoryDrill}
          />
          <ReviewWeakQueue
            queueCount={weakQueueAct.length}
            createAction={createActWeakQueueDrill}
          />
        </>
      )}

      {/* Empty state when the student has no review-eligible
          attempts on either test type. */}
      {!hasSatData && !hasActData && (
        <section className={s.card}>
          <div className={s.empty}>
            <div className={s.emptyTitle}>Nothing to review yet.</div>
            <div className={s.emptyBody}>
              As you answer questions across practice, assignments,
              and tests, the skills you stumble on and your weakest
              questions will surface here.
            </div>
          </div>
        </section>
      )}

    </main>
  );
}

// ──────────────────────────────────────────────────────────────
// Shared sub-sections. SAT and ACT branches render the same shape;
// the only differences are the action they fire and the singular
// noun the empty-state copy uses ("skill" vs "category").
// ──────────────────────────────────────────────────────────────

function ReviewCommonErrors({ commonErrors, labelKind, createAction }) {
  const noun = labelKind === 'category' ? 'category' : 'skill';
  const pluralNoun = labelKind === 'category' ? 'categories' : 'skills';
  return (
    <section className={s.card}>
      <div className={s.cardHeader}>
        <div>
          <div className={s.h2}>
            <IconTile icon={SparklesIcon} palette="amber" size="md" />
            <span>Common errors</span>
          </div>
          <div className={s.cardHint}>
            {pluralNoun.charAt(0).toUpperCase() + pluralNoun.slice(1)} where you&apos;ve missed the most. Click one
            to drill that {noun} only.
          </div>
        </div>
        <span className={s.cardTag}>
          {commonErrors.length} {commonErrors.length === 1 ? noun : pluralNoun}
        </span>
      </div>
      {commonErrors.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyTitle}>No errors to review yet.</div>
          <div className={s.emptyBody}>
            As you answer questions, the {pluralNoun} where you slip
            up show up here.
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
                createAction={createAction}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewWeakQueue({ queueCount, createAction }) {
  return (
    <section className={s.card}>
      <div className={s.cardHeader}>
        <div>
          <div className={s.h2}>
            <IconTile icon={TargetIcon} palette="cyan" size="md" />
            <span>Weak questions drill</span>
          </div>
          <div className={s.cardHint}>
            Your trickiest questions, ordered by how recently you
            missed them and how hard they are. Answers and rationales
            reveal at the end of each question.
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
          createAction={createAction}
        />
      )}
    </section>
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

