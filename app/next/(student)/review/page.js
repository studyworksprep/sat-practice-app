// Student → Review. Pre-test study surface.
//
// The Review tab is for the days leading up to the test: "I have
// ten days; what should I do?" Three tools, top to bottom:
//
//   1. Common errors — skills where the student has missed the
//      most questions, with a one-click drill per skill.
//   2. Weak questions drill — a mixed drill of the student's
//      weakest questions across every skill, picked by the Smart
//      Review priority formula (wrong now + historically bad +
//      stale + hard), ported to the v2 attempts table.
//   3. Flashcards — entry point to the existing flashcards UI
//      for terms / vocabulary check.
//
// If the student has set a target SAT date on their profile
// (profiles.sat_test_date), a countdown banner pins to the top
// with a suggested allocation across the three tools for the
// remaining days.
//
// The three cards all share the same visual vocabulary as the
// rest of the new tree — design-kit tokens, header eyebrow, stat
// tiles, content cards.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { buildWeakQueue, commonErrorsFromAttempts } from '@/lib/practice/weak-queue';
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
  // aggregation, and the student's flashcard sets.
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

  // Common Errors aggregation: reuse the question meta we'd need
  // anyway by grabbing the distinct question ids out of attempts
  // and looking them up once.
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

  // Study plan: simple allocation across the three tools based on
  // how many days remain until the student's target SAT date. If
  // no target date is set the banner doesn't render.
  const countdown = buildCountdown(extendedProfile?.sat_test_date ?? null);

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

      {countdown && <CountdownBanner countdown={countdown} />}

      {/* ---------- Common errors ---------- */}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Common errors</div>
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
            <div className={s.h2}>Weak questions drill</div>
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

      {/* ---------- Flashcards ---------- */}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Flashcards</div>
            <div className={s.cardHint}>
              Terms and vocabulary you&apos;ve stashed for study.
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

// ──────────────────────────────────────────────────────────────
// Countdown banner.
// ──────────────────────────────────────────────────────────────

function CountdownBanner({ countdown }) {
  return (
    <div className={s.countdown}>
      <div className={s.countdownTop}>
        <div>
          <div className={s.countdownTitle}>
            {countdown.daysLeft === 0
              ? 'Your SAT is today — rest up'
              : countdown.daysLeft === 1
                ? 'Your SAT is tomorrow'
                : countdown.daysLeft < 0
                  ? 'Your target test date has passed'
                  : `Your SAT is in ${countdown.daysLeft} days`}
          </div>
          <div className={s.countdownSub}>
            {countdown.dateLabel}
          </div>
        </div>
        {countdown.plan && countdown.daysLeft > 0 && (
          <div className={s.countdownPlan}>
            <div className={s.countdownPlanLabel}>Suggested split</div>
            <div className={s.countdownPlanRow}>
              <span>
                <strong>{countdown.plan.flashcards}</strong> flashcards
              </span>
              <span>
                <strong>{countdown.plan.weak}</strong> weak questions
              </span>
              <span>
                <strong>{countdown.plan.mocks}</strong> full tests
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function buildCountdown(isoDate) {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  const dateLabel = d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    daysLeft,
    dateLabel,
    plan: daysLeft > 0 ? allocateDays(daysLeft) : null,
  };
}

/**
 * Rough study-plan allocation for the countdown banner. Biases
 * toward mock tests as the test date gets closer, toward
 * flashcards + weak questions when there's still runway.
 * Days-integer output, sum equals daysLeft.
 */
function allocateDays(daysLeft) {
  // Weights: close-to-test (under 5 days) leans heavy on mocks;
  // 5–14 balanced; 15+ biases toward weak-q + flashcards.
  let wFlash;
  let wWeak;
  let wMocks;
  if (daysLeft <= 5) {
    wFlash = 1; wWeak = 2; wMocks = 2;
  } else if (daysLeft <= 14) {
    wFlash = 2; wWeak = 3; wMocks = 2;
  } else {
    wFlash = 3; wWeak = 4; wMocks = 2;
  }
  const total = wFlash + wWeak + wMocks;
  const raw = [
    (daysLeft * wFlash) / total,
    (daysLeft * wWeak) / total,
    (daysLeft * wMocks) / total,
  ];
  const floored = raw.map(Math.floor);
  let leftover = daysLeft - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < leftover; k += 1) {
    floored[order[k % order.length].i] += 1;
  }
  return { flashcards: floored[0], weak: floored[1], mocks: floored[2] };
}
