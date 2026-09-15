// Onboarding intake (docs/student-onboarding-and-plan-redesign-2026-09.md
// §3): situation → (targets) → availability → self-assessment → build →
// preview/activate. A brand-new self-serve student goes signup → here →
// an activated, phased plan with no human involvement.
//
// STATELESS step machine: every visit derives the current step from
// data (profile goal/date, the student_intake row, any draft plan), so
// the wizard survives leaving mid-flow. ?step=… revisits an earlier
// step with the answers prefilled; it never jumps ahead. The ladder
// itself is pure (lib/plan/intake.ts) and unit-tested.
//
// No diagnostic: evidence comes from the student's answers now and from
// the coverage phase of the plan as they work (design doc §2).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { normalizePhases, PlanOverview } from '@/lib/ui/PlanOverview';
import {
  SAT_DOMAIN_CODES,
  deriveWizardStep,
  parseIntakeRow,
  shouldRouteToWelcome,
} from '@/lib/plan/intake';
import type { WizardStep } from '@/lib/plan/intake';
import { SAT_TAXONOMY, findDomain } from '@/lib/practice/sat-taxonomy';
import type { PlanMode } from '@/lib/plan/generate-plan';
import {
  saveSituationAction,
  saveTargetsAction,
  saveAvailabilityAction,
  saveAssessmentAction,
  buildPlanAction,
  activateFirstPlanAction,
  setAsideAction,
} from './actions';
import {
  SituationForm,
  TargetsForm,
  AvailabilityForm,
  SelfAssessmentForm,
  BuildPlanButton,
  RebuildPlanLink,
  ActivateFirstPlanButton,
  SetAsideLink,
} from './WelcomeInteractive';
import s from './Welcome.module.css';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | undefined>> };

const STEP_LABEL: Record<WizardStep, string> = {
  situation: 'Your situation',
  targets: 'Your targets',
  availability: 'Availability',
  assess: 'Self-check',
  build: 'Your plan',
  preview: 'Your plan',
};

function StepHeader({ steps, active }: { steps: WizardStep[]; active: WizardStep }) {
  // build and preview share one visible step.
  const visible = steps.filter((st) => st !== 'build');
  const activeVisible = active === 'build' ? 'preview' : active;
  const activeIdx = visible.indexOf(activeVisible);
  return (
    <ol className={s.steps}>
      {visible.map((st, i) => (
        <li
          key={st}
          className={`${s.step} ${i === activeIdx ? s.stepActive : ''} ${i < activeIdx ? s.stepDone : ''}`}
        >
          <span className={s.stepNum}>{i < activeIdx ? '✓' : i + 1}</span>
          {STEP_LABEL[st]}
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

  const steps: WizardStep[] =
    intake.intent === 'own_targets'
      ? ['situation', 'targets', 'availability', 'assess', 'build', 'preview']
      : ['situation', 'availability', 'assess', 'build', 'preview'];

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
  const ratingRows = SAT_DOMAIN_CODES.map((code) => {
    const d = findDomain(code);
    return {
      code,
      name: d?.name ?? code,
      section: d?.subjectCode === 'math' ? 'Math' : 'Reading & Writing',
    };
  });

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Welcome{firstName ? `, ${firstName}` : ''}</div>
        <h1 className={s.h1}>Let&rsquo;s set up your study plan</h1>
        <p className={s.sub}>
          A few quick questions about where you are and how you want to work, then a
          week-by-week plan that opens each day to exactly what to do next.
        </p>
      </header>

      <StepHeader steps={steps} active={step} />

      {step === 'situation' ? (
        <section className={s.card}>
          <h2 className={s.cardTitle}>Where are you starting from?</h2>
          <p className={s.cardSub}>
            Your target and test date set the pace. How much prep you have done decides
            whether the plan starts by covering every topic or goes straight to your
            weak areas. You can change all of this later.
          </p>
          <SituationForm
            action={saveSituationAction}
            defaults={{
              target: goal ?? '',
              testDate: testDate ?? '',
              prepLevel: intake.prepLevel,
              intent: intake.intent,
            }}
          />
        </section>
      ) : null}

      {step === 'targets' ? (
        <section className={s.card}>
          <h2 className={s.cardTitle}>What do you want to work on?</h2>
          <p className={s.cardSub}>
            Pick the skills you already know you need. The plan cycles through them, with a
            lesson the first time a weak one comes up. You can add or remove skills later.
          </p>
          <TargetsForm
            action={saveTargetsAction}
            domains={SAT_TAXONOMY}
            selected={selectedTargets}
            fullTests={intake.fullTests}
          />
        </section>
      ) : null}

      {step === 'availability' ? (
        <section className={s.card}>
          <h2 className={s.cardTitle}>When can you study?</h2>
          <p className={s.cardSub}>
            Hours per week sets how many tasks each week gets. Days you pick are the only
            days tasks land on, so the plan fits around your week instead of fighting it.
          </p>
          <AvailabilityForm
            action={saveAvailabilityAction}
            defaults={{
              weeklyHours: intake.weeklyHours ?? 5,
              studyDays: intake.studyDays ?? [0, 1, 2, 3, 4, 5, 6],
            }}
          />
        </section>
      ) : null}

      {step === 'assess' ? (
        <section className={s.card}>
          <h2 className={s.cardTitle}>How comfortable are you with each area right now?</h2>
          <p className={s.cardSub}>
            There are no wrong answers. This helps the plan decide where to start; your
            actual practice takes over from here within a couple of weeks.
          </p>
          <SelfAssessmentForm
            action={saveAssessmentAction}
            rows={ratingRows}
            defaults={intake.selfRating}
          />
        </section>
      ) : null}

      {step === 'build' ? (
        <section className={s.card}>
          <h2 className={s.cardTitle}>Build your plan</h2>
          <p className={s.cardSub}>
            Aiming for <strong>{goal}</strong> on <strong>{testDate}</strong>, about{' '}
            <strong>{intake.weeklyHours}</strong> hours a week.{' '}
            <Link href="/welcome?step=situation" className={s.inlineLink}>
              Change something
            </Link>
          </p>
          <BuildPlanButton action={buildPlanAction} />
        </section>
      ) : null}

      {step === 'preview' && draft ? (
        <section className={`${s.card} ${s.reviewCard}`}>
          <h2 className={s.cardTitle}>Here&rsquo;s your plan</h2>
          <p className={s.cardSub}>
            Read the outline, open any week to see what&rsquo;s in it, then start. Once
            it&rsquo;s live, the <strong>Today</strong> page becomes your home base: one to
            three tasks a day, each with a reason.
          </p>
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
              Not right?{' '}
              <Link href="/welcome?step=situation" className={s.inlineLink}>Change my answers</Link>
              {' · '}
              <Link href="/welcome?step=availability" className={s.inlineLink}>Change hours or days</Link>
              {' · '}
              <RebuildPlanLink action={buildPlanAction} />
            </span>
          </div>
        </section>
      ) : null}

      {showSetAside && step !== 'preview' && (
        <div className={s.setAside}>
          <SetAsideLink action={setAsideAction} />
        </div>
      )}
    </main>
  );
}
