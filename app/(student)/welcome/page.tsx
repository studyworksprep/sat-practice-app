// First-run wizard (§6.4): target score → short diagnostic → first
// plan. Closes the Phase 2 acceptance loop — a brand-new self-serve
// student goes signup → here → first task with no human involvement.
//
// STATELESS step machine: every visit derives the current step from
// data, so the wizard survives leaving mid-flow (finish the diagnostic
// tomorrow, come back, it picks up at "build my plan"):
//
//   active plan exists            → nothing to do here → /today
//   no target or test date        → step 1 (goal)
//   draft plan exists             → step 3 (review + activate)
//   open diagnostic session       → step 2 (resume)
//   no attempts yet (and no skip) → step 2 (start or skip)
//   otherwise                     → step 3 (generate)
//
// The diagnostic is a normal practice session (marked
// filter_criteria.diagnostic) — the existing runner, submit path, and
// report all apply; finishing it feeds attempts → the on-demand
// mastery snapshot → the generator. ?skip=1 lets a student go
// straight to a plan (the generator handles unknown mastery, and the
// §2.5 weekly re-pace corrects as real data arrives).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import {
  saveGoalAction,
  startDiagnosticAction,
  generateFirstPlanAction,
  activateFirstPlanAction,
} from './actions';
import {
  GoalForm,
  StartDiagnosticForm,
  GenerateFirstPlanForm,
  ActivateFirstPlanButton,
} from './WelcomeInteractive';
import s from './Welcome.module.css';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | undefined>> };

const STEPS = ['Your goal', 'Quick diagnostic', 'Your plan'] as const;

function StepHeader({ active }: { active: number }) {
  return (
    <ol className={s.steps}>
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={`${s.step} ${i === active ? s.stepActive : ''} ${i < active ? s.stepDone : ''}`}
        >
          <span className={s.stepNum}>{i < active ? '✓' : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export default async function WelcomePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'practice') redirect('/practice');
  if (profile.role !== 'student') redirect('/tutor/dashboard');

  // Already living the plan → nothing to set up.
  const { data: activePlan } = await supabase
    .from('study_plans')
    .select('id')
    .eq('student_id', user.id)
    .eq('test_type', 'sat')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (activePlan) redirect('/today');

  const [{ data: fullProfile }, { data: draft }, { data: openDiag }, { count: attemptCount }] = await Promise.all([
    supabase
      .from('profiles')
      .select('target_sat_score, sat_test_date')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('study_plans')
      .select('id, goal_score, test_date, config')
      .eq('student_id', user.id)
      .eq('test_type', 'sat')
      .eq('status', 'draft')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('practice_sessions')
      .select('id, current_position')
      .eq('user_id', user.id)
      .eq('status', 'in_progress')
      .contains('filter_criteria', { diagnostic: true })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ]);

  const goal = fullProfile?.target_sat_score ?? null;
  // Normalize: the column can surface as a full timestamp.
  const testDate = fullProfile?.sat_test_date
    ? String(fullProfile.sat_test_date).slice(0, 10)
    : null;

  const skipped = sp.skip === '1';
  const rebuilding = sp.rebuild === '1';
  const hasSignal = (attemptCount ?? 0) > 0;

  // Derive the step (see header comment for the ladder). ?rebuild=1
  // shows the generate form over an existing draft — generating again
  // replaces it (writeDraftPlan swaps the prior draft atomically).
  let step: 'goal' | 'diagnostic' | 'generate' | 'review';
  if (!goal || !testDate) step = 'goal';
  else if (draft && !rebuilding) step = 'review';
  else if (openDiag) step = 'diagnostic';
  else if (!hasSignal && !skipped && !rebuilding) step = 'diagnostic';
  else step = 'generate';

  // Draft summary for the review step.
  let draftSummary: { taskCount: number; weeks: number } | null = null;
  if (step === 'review' && draft) {
    const { data: taskRows } = await supabase
      .from('plan_tasks')
      .select('week_index')
      .eq('plan_id', draft.id);
    const weeks = (taskRows ?? []).reduce((m, t) => Math.max(m, t.week_index + 1), 0);
    draftSummary = { taskCount: (taskRows ?? []).length, weeks };
  }

  const stepIndex = step === 'goal' ? 0 : step === 'diagnostic' ? 1 : 2;
  const firstName = profile.first_name ?? null;

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Welcome{firstName ? `, ${firstName}` : ''}</div>
        <h1 className={s.h1}>Let&rsquo;s set up your study plan</h1>
        <p className={s.sub}>
          Three quick steps: tell us your goal, show us where you are, and we&rsquo;ll build a
          week-by-week plan that opens each day to exactly what to do next.
        </p>
      </header>

      <StepHeader active={stepIndex} />

      {step === 'goal' ? (
        <section className={s.card}>
          <h2 className={s.cardTitle}>Where are you headed?</h2>
          <p className={s.cardSub}>
            Your target score and test date set the pace of the whole plan. You can change both
            later.
          </p>
          <GoalForm
            action={saveGoalAction}
            defaults={{ target: goal ?? '', testDate: testDate ?? '' }}
          />
        </section>
      ) : null}

      {step === 'diagnostic' ? (
        <section className={s.card}>
          <h2 className={s.cardTitle}>
            {openDiag ? 'Finish your diagnostic' : 'Show us where you are'}
          </h2>
          <p className={s.cardSub}>
            {openDiag
              ? 'You have a diagnostic in progress — pick up where you left off. Your plan gets built from how you do.'
              : 'A short mixed set — about 16 questions across every SAT topic, 15–20 minutes. It’s how the plan knows what to work on first. No score pressure; wrong answers here are the useful ones.'}
          </p>
          {openDiag ? (
            <div className={s.actionsRow}>
              <Link
                href={`/practice/s/${openDiag.id}/${openDiag.current_position ?? 0}`}
                className={s.primaryBtnLink}
              >
                Resume diagnostic
              </Link>
            </div>
          ) : (
            <div className={s.actionsRow}>
              <StartDiagnosticForm action={startDiagnosticAction} />
              <Link href="/welcome?skip=1" className={s.skipLink}>
                Skip for now — build my plan without it
              </Link>
            </div>
          )}
        </section>
      ) : null}

      {step === 'generate' ? (
        <section className={s.card}>
          <h2 className={s.cardTitle}>Build your plan</h2>
          <p className={s.cardSub}>
            Aiming for <strong>{goal}</strong> on <strong>{testDate}</strong>
            {hasSignal
              ? ' — using what your practice so far shows about your strengths and gaps.'
              : ' — starting from a balanced baseline; the plan adjusts weekly as you practice.'}{' '}
            <Link href="/welcome" className={s.inlineLink}>
              Change goal
            </Link>
          </p>
          <GenerateFirstPlanForm action={generateFirstPlanAction} defaultHours={5} />
        </section>
      ) : null}

      {step === 'review' && draft ? (
        <section className={`${s.card} ${s.reviewCard}`}>
          <h2 className={s.cardTitle}>Your plan is ready</h2>
          <p className={s.cardSub}>
            {draftSummary?.weeks ?? '—'} weeks · {draftSummary?.taskCount ?? '—'} tasks toward{' '}
            <strong>{draft.goal_score}</strong> by <strong>{draft.test_date}</strong>. Activate it
            and the <strong>Today</strong> page becomes your home base: one to three tasks a day,
            each chosen for a reason.
          </p>
          <div className={s.actionsRow}>
            <ActivateFirstPlanButton action={activateFirstPlanAction} planId={draft.id} />
            <span className={s.skipLink}>
              Not right? <Link href="/welcome?rebuild=1" className={s.inlineLink}>Rebuild it</Link>
            </span>
          </div>
        </section>
      ) : null}
    </main>
  );
}
