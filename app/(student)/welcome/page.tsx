// Onboarding intake (docs/student-onboarding-and-plan-redesign-2026-09.md
// §3), one question per screen: target → test date → prep → intent →
// (targets) → hours → days → self-check → build → preview/activate. A
// brand-new self-serve student goes signup → here → an activated, phased
// plan with no human involvement.
//
// STATELESS step machine: every visit derives the current step from
// data (each answer is its own column on profiles / student_intake, plus
// any draft plan), so the wizard survives leaving mid-flow. ?step=…
// revisits an earlier question with the answer prefilled; it never
// jumps ahead. The ladder itself is pure (lib/plan/intake.ts) and
// unit-tested.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { normalizePhases, PlanOverview } from '@/lib/ui/PlanOverview';
import {
  DOMAIN_EXAMPLES,
  SAT_DOMAIN_CODES,
  deriveWizardStep,
  parseIntakeRow,
  questionSteps,
  shouldRouteToWelcome,
} from '@/lib/plan/intake';
import type { WizardStep } from '@/lib/plan/intake';
import { SAT_TAXONOMY, findDomain } from '@/lib/practice/sat-taxonomy';
import type { PlanMode } from '@/lib/plan/generate-plan';
import {
  saveAnswerAction,
  saveTargetsAction,
  saveAssessmentAction,
  buildPlanAction,
  activateFirstPlanAction,
  setAsideAction,
} from './actions';
import {
  TargetForm,
  TestDateForm,
  PrepForm,
  IntentForm,
  TargetsForm,
  HoursForm,
  DaysForm,
  SelfCheck,
  BuildPlanButton,
  RebuildPlanLink,
  ActivateFirstPlanButton,
  SetAsideLink,
} from './WelcomeInteractive';
import s from './Welcome.module.css';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | undefined>> };

// One friendly question per screen. Title is the question; sub is the
// reassurance — why we ask, and that it can change later.
const QUESTION_COPY: Partial<Record<WizardStep, { title: string; sub: string }>> = {
  target: {
    title: 'What score are you aiming for?',
    sub: 'A stretch goal is fine. This sets the pace of the plan, and you can change it any time.',
  },
  test_date: {
    title: 'When are you taking the SAT?',
    sub: "Haven't registered yet? Pick the date you're planning on — the plan works backwards from it.",
  },
  prep: {
    title: 'How much SAT prep have you done so far?',
    sub: 'No wrong answer. This decides whether we start by covering every topic or go straight to your weak spots.',
  },
  intent: {
    title: 'How do you want your plan to work?',
    sub: 'Most students pick the first one. Pick the second if you already know exactly what you need to work on.',
  },
  targets: {
    title: 'Which skills do you want to work on?',
    sub: 'Pick as many as you like. The plan cycles through them, with a lesson the first time a weak one comes up.',
  },
  hours: {
    title: 'About how many hours a week can you study?',
    sub: 'Be honest — a plan you can actually follow beats an ambitious one you abandon.',
  },
  days: {
    title: 'Which days work for you?',
    sub: 'Pick the days you can usually sit down for a while. Weekends count.',
  },
  assess: {
    title: 'Last one — how comfortable are you with each area?',
    sub: "Eight quick taps. There are no wrong answers, and \"I'm not sure\" is a perfectly good one.",
  },
};

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

  const [{ data: fullProfile }, { data: intakeRow }, { data: draft }] = await Promise.all([
    supabase
      .from('profiles')
      .select('target_sat_score, sat_test_date')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('student_intake')
      .select('prep_level, intent, targets, weekly_hours, study_days, self_rating, full_tests, completed_at, skipped_at')
      .eq('student_id', user.id)
      .maybeSingle(),
    supabase
      .from('study_plans')
      .select('id, goal_score, test_date, mode, rationale, phases')
      .eq('student_id', user.id)
      .eq('test_type', 'sat')
      .eq('status', 'draft')
      .limit(1)
      .maybeSingle(),
  ]);

  const goal = fullProfile?.target_sat_score ?? null;
  // Normalize: the column can surface as a full timestamp.
  const testDate = fullProfile?.sat_test_date
    ? String(fullProfile.sat_test_date).slice(0, 10)
    : null;
  const intake = parseIntakeRow(intakeRow);

  const step = deriveWizardStep({
    goal,
    testDate,
    intake,
    hasDraft: Boolean(draft),
    override: sp.step ?? null,
  });

  const questions = questionSteps(intake.intent);
  const qIndex = questions.indexOf(step);
  const isQuestion = qIndex >= 0;
  const prevStep = qIndex > 0 ? questions[qIndex - 1] : null;

  // Draft tasks for the preview step.
  let draftTasks: {
    id: string;
    weekIndex: number;
    scheduledDate: string | null;
    taskType: string;
    payload: Record<string, unknown>;
  }[] = [];
  if (step === 'preview' && draft) {
    const { data: taskRows } = await supabase
      .from('plan_tasks')
      .select('id, week_index, scheduled_date, task_type, payload')
      .eq('plan_id', draft.id)
      .order('scheduled_date', { ascending: true, nullsFirst: true });
    draftTasks = (taskRows ?? []).map((t) => ({
      id: t.id,
      weekIndex: t.week_index,
      scheduledDate: t.scheduled_date,
      taskType: t.task_type,
      payload: (t.payload ?? {}) as Record<string, unknown>,
    }));
  }

  const firstName = profile.first_name ?? null;
  const showSetAside = shouldRouteToWelcome({ hasActivePlan: false, intake });
  const selectedTargets = new Set(intake.targets.map((t) => `${t.domainCode}|${t.skillCode}`));
  const selfCheckRows = SAT_DOMAIN_CODES.map((code) => {
    const d = findDomain(code);
    return {
      code,
      name: d?.name ?? code,
      section: d?.subjectCode === 'math' ? 'Math' : 'Reading & Writing',
      example: DOMAIN_EXAMPLES[code],
    };
  });
  const copy = QUESTION_COPY[step];

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>{firstName ? `Hi, ${firstName}` : 'Welcome'}</div>
        <h1 className={s.h1}>
          {step === 'preview' ? 'Here’s your plan' : 'Let’s build your study plan'}
        </h1>
        {isQuestion ? (
          <div className={s.progress} aria-label={`Question ${qIndex + 1} of ${questions.length}`}>
            <div className={s.progressBar} role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={qIndex}>
              <div className={s.progressFill} style={{ width: `${Math.round((qIndex / questions.length) * 100)}%` }} />
            </div>
            <span className={s.progressLabel}>Question {qIndex + 1} of {questions.length}</span>
          </div>
        ) : (
          <p className={s.sub}>
            {step === 'preview'
              ? 'Read the outline, open any week to see what’s in it, then start whenever you’re ready.'
              : 'A few quick questions, then a week-by-week plan that opens each day to exactly what to do next.'}
          </p>
        )}
      </header>

      {isQuestion && copy && (
        <section className={s.card}>
          <h2 className={s.cardTitle}>{copy.title}</h2>
          <p className={s.cardSub}>{copy.sub}</p>

          {step === 'target' && <TargetForm action={saveAnswerAction} defaultValue={goal ?? ''} />}
          {step === 'test_date' && <TestDateForm action={saveAnswerAction} defaultValue={testDate ?? ''} />}
          {step === 'prep' && <PrepForm action={saveAnswerAction} defaultValue={intake.prepLevel} />}
          {step === 'intent' && <IntentForm action={saveAnswerAction} defaultValue={intake.intent} />}
          {step === 'targets' && (
            <TargetsForm
              action={saveTargetsAction}
              domains={SAT_TAXONOMY}
              examples={DOMAIN_EXAMPLES}
              selected={selectedTargets}
              fullTests={intake.fullTests}
            />
          )}
          {step === 'hours' && <HoursForm action={saveAnswerAction} defaultValue={intake.weeklyHours ?? 5} />}
          {step === 'days' && (
            <DaysForm action={saveAnswerAction} defaultValue={intake.studyDays ?? [1, 2, 3, 4, 5]} />
          )}
          {step === 'assess' && (
            <SelfCheck action={saveAssessmentAction} rows={selfCheckRows} defaults={intake.selfRating} />
          )}

          {prevStep && (
            <div className={s.backRow}>
              <Link href={`/welcome?step=${prevStep}`} className={s.backLink}>
                ← Back
              </Link>
            </div>
          )}
        </section>
      )}

      {step === 'build' && (
        <section className={s.card}>
          <h2 className={s.cardTitle}>Ready when you are</h2>
          <p className={s.cardSub}>
            Aiming for <strong>{goal}</strong> on <strong>{testDate}</strong>, about{' '}
            <strong>{intake.weeklyHours}</strong> hours a week.{' '}
            <Link href="/welcome?step=target" className={s.inlineLink}>
              Change an answer
            </Link>
          </p>
          <BuildPlanButton action={buildPlanAction} />
        </section>
      )}

      {step === 'preview' && draft && (
        <section className={`${s.card} ${s.reviewCard}`}>
          <PlanOverview
            goalScore={draft.goal_score ?? goal ?? 0}
            testDate={draft.test_date ?? testDate ?? ''}
            mode={(draft.mode as PlanMode | null) ?? null}
            rationale={draft.rationale ?? null}
            phases={normalizePhases(draft.phases)}
            tasks={draftTasks}
            expandWeeks={2}
          />
          <div className={`${s.actionsRow} ${s.previewActions}`}>
            <ActivateFirstPlanButton action={activateFirstPlanAction} planId={draft.id} />
            <span className={s.skipLink}>
              Not quite right?{' '}
              <Link href="/welcome?step=target" className={s.inlineLink}>Change an answer</Link>
              {' · '}
              <Link href="/welcome?step=hours" className={s.inlineLink}>Change hours or days</Link>
              {' · '}
              <RebuildPlanLink action={buildPlanAction} />
            </span>
          </div>
        </section>
      )}

      {showSetAside && step !== 'preview' && (
        <div className={s.setAside}>
          <SetAsideLink action={setAsideAction} />
        </div>
      )}
    </main>
  );
}
