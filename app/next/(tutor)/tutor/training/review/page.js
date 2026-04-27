// Tutor → training review. Same three-tools framing as the
// student /review page (Common errors, Weak questions drill,
// Flashcards), retargeted at the teacher's own training data.
//
// All scoring runs through lib/practice/weak-queue against the
// teacher's user_id — RLS scopes attempts to that user, so a
// teacher's training queue and a student's queue stay separate
// by design. The drill actions use mode='training' on the
// resulting practice_sessions row.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { buildWeakQueue, commonErrorsFromAttempts } from '@/lib/practice/weak-queue';
import { StudyCountdown } from '@/lib/practice/StudyCountdown';
// Reuse the student review's launcher islands. They're generic
// (size picker + Start button bound to whatever Server Action
// we hand them) so the training tree just passes its own actions.
import { WeakQueueLauncher } from '../../../../(student)/review/WeakQueueLauncher';
import { SkillDrillButton } from '../../../../(student)/review/SkillDrillButton';
import {
  createTrainingWeakQueueDrill,
  createTrainingSkillDrill,
} from './actions';
import s from './TrainingReview.module.css';

export const dynamic = 'force-dynamic';

const COMMON_ERRORS_TOP_N = 3;

export default async function TutorTrainingReviewPage() {
  const { user, profile, supabase } = await requireUser();
  if (profile.role === 'student' || profile.role === 'practice') redirect('/review');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  const [
    { data: extendedProfile },
    weakQueue,
    attemptsRaw,
    { data: flashcardSets },
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
  ]);

  const attemptedQids = Array.from(
    new Set(attemptsRaw.map((a) => a.question_id)),
  );
  const metaRows = attemptedQids.length
    ? await fetchAll((from, to) =>
        supabase
          .from('questions_v2')
          .select('id, skill_name, domain_name, is_published, is_broken, deleted_at')
          .in('id', attemptedQids)
          .range(from, to),
      )
    : [];
  const metaById = new Map(
    metaRows
      .filter((q) => q.is_published && !q.is_broken && q.deleted_at == null)
      .map((q) => [q.id, q]),
  );

  const commonErrors = commonErrorsFromAttempts(attemptsRaw, metaById)
    .filter((row) => row.wrong > 0)
    .slice(0, COMMON_ERRORS_TOP_N);

  let flashcardTotal = 0;
  const setIds = (flashcardSets ?? []).map((row) => row.id);
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
        <div className={s.eyebrow}>Train · Review</div>
        <h1 className={s.h1}>Review</h1>
        <p className={s.sub}>
          Pre-test study mode for your own SAT prep. Drill your
          weakest questions, fix common errors, and keep your
          flashcards fresh.
        </p>
      </header>

      <StudyCountdown
        isoDate={extendedProfile?.sat_test_date ?? null}
        todayMs={nowMs}
      />

      {/* ---------- Common errors ---------- */}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Common errors</div>
            <div className={s.cardHint}>
              Skills where you&apos;ve missed the most. Click one to drill that skill only.
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
              As you do training questions across practice + assignments,
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
                  createAction={createTrainingSkillDrill}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Weak queue ---------- */}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Weak questions drill</div>
            <div className={s.cardHint}>
              Your trickiest questions across every skill, ordered by
              recency and difficulty. Rationales reveal at the end of
              each question.
            </div>
          </div>
          <span className={s.cardTag}>{queueCount.toLocaleString()} in queue</span>
        </div>
        {queueCount === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyTitle}>Nothing in your queue yet.</div>
            <div className={s.emptyBody}>
              Anything you get wrong on training practice or
              assignments lands here automatically.
            </div>
          </div>
        ) : (
          <WeakQueueLauncher
            queueCount={queueCount}
            createAction={createTrainingWeakQueueDrill}
          />
        )}
      </section>

      {/* ---------- Flashcards ---------- */}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Flashcards</div>
            <div className={s.cardHint}>
              Terms and vocabulary you&apos;ve stashed for your own study.
            </div>
          </div>
          <span className={s.cardTag}>
            {flashcardTotal.toLocaleString()} card{flashcardTotal === 1 ? '' : 's'}
          </span>
        </div>
        {flashcardTotal === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyTitle}>No flashcards yet.</div>
            <div className={s.emptyBody}>
              Create a set to start stashing terms you want to keep
              fresh before the test.
            </div>
            <Link href="/flashcards" className={s.emptyCta}>
              Go to flashcards →
            </Link>
          </div>
        ) : (
          <div className={s.flashcardRow}>
            <div className={s.flashcardInfo}>
              <div className={s.flashcardTotal}>{flashcardTotal}</div>
              <div className={s.flashcardLabel}>
                Total cards across {(flashcardSets ?? []).length} set
                {(flashcardSets ?? []).length === 1 ? '' : 's'}
              </div>
            </div>
            <Link href="/flashcards" className={s.flashcardCta}>
              Open flashcards →
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
