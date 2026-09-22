// Onboarding intake (docs/student-onboarding-and-plan-redesign-2026-09.md
// §3), one question per screen: welcome → target → test date → prep →
// intent → (targets) → hours → days → self-check → build → preview.
// Renders bare (no sidebar — nav-links SHELL_SUPPRESSED_PATTERNS) so a
// new student sees one thing at a time.
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
import { hasAssignedTutor } from '@/lib/api/hasAssignedTutor';
import { hasPracticeHistory } from '@/lib/api/hasPracticeHistory';
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
  startIntakeAction,
  saveAnswerAction,
  saveTargetsAction,
  saveAssessmentAction,
  buildPlanAction,
  activateFirstPlanAction,
  setAsideAction,
} from './actions';
import {
  StartIntakeButton,
  TargetForm,
  TestDateForm,
  PrepForm,
  IntentForm,
  TargetsForm,
  HoursForm,
  DaysForm,
  SelfCheckGrid,
  BuildPlanButton,
  RebuildPlanLink,
  ActivateFirstPlanButton,
  SetAsideLink,
} from './WelcomeInteractive';
import s from './Welcome.module.css';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | undefined>> };

// One question per screen: the question, and at most one short line
// under it. The reassurance lives in the option copy, not in paragraphs.
const QUESTION_COPY: Partial<Record<WizardStep, { title: string; sub?: string }>> = {
  target: { title: 'What score are you aiming for?', sub: 'A stretch goal is fine — you can change it later.' },
  test_date: { title: 'When are you taking the SAT?', sub: "Not registered yet? Pick the date you're planning on." },
  prep: { title: 'How much SAT prep have you done?' },
  intent: { title: 'How should the plan work?' },
  targets: { title: 'Which skills do you want to work on?', sub: 'Pick as many as you like.' },
  hours: { title: 'How many hours a week can you study?' },
  days: { title: 'Which days work for you?' },
  assess: { title: 'How comfortable are you with each area?', sub: "No wrong answers — \"not sure\" is fine." },
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
  if (activePlan) redirect('/dashboard');

  const [{ data: fullProfile }, { data: intakeRow }, { data: draft }, practiced, hasTutor] = await Promise.all([
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
    hasPracticeHistory(supabase, user.id),
    hasAssignedTutor(supabase, user.id),
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
  const prevStep: WizardStep | null = qIndex > 0 ? questions[qIndex - 1] : null;

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
  // "I'll do this later" only makes sense for a student who would
  // otherwise be routed here on login; an existing student who opened
  // the wizard from the dashboard can simply leave.
  const showSetAside = shouldRouteToWelcome({ hasActivePlan: false, hasPracticeHistory: practiced, hasTutor, intake });
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
    <div className={s.page}>
      <main className={`${s.container} ${step === 'preview' ? s.containerWide : ''}`}>
        <div className={s.brand}>
          <span className={s.brandName}>Study<span>works</span></span>
          {isQuestion && <span className={s.brandRight}>Setting up your plan</span>}
        </div>

        {isQuestion && (
          <div className={s.progress} aria-label={`Question ${qIndex + 1} of ${questions.length}`}>
            <div className={s.progressBar} role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={qIndex}>
              <div className={s.progressFill} style={{ width: `${Math.round(((qIndex + 1) / questions.length) * 100)}%` }} />
            </div>
            <span className={s.progressLabel}>{qIndex + 1} of {questions.length}</span>
          </div>
        )}

        {step === 'welcome' && (
          <section className={`${s.card} ${s.welcomeCard}`}>
            <div className={s.welcomeHead}>
              <div className={s.welcomeEyebrow}>Welcome to Studyworks</div>
              <h1 className={s.welcomeTitle}>{firstName ? `Hi ${firstName}, let’s build your study plan.` : 'Let’s build your study plan.'}</h1>
              <p className={s.welcomeLead}>
                Seven quick questions, then a week-by-week plan that opens each day to exactly what to do next.
              </p>
              <div className={s.actionsRow}>
                <StartIntakeButton action={startIntakeAction} />
                {showSetAside && <SetAsideLink action={setAsideAction} />}
              </div>
            </div>
            <ol className={s.welcomeSteps}>
              <li className={s.welcomeStep}>
                <span className={s.welcomeStepNum}>1</span>
                <div>
                  <div className={s.welcomeStepTitle}>Tell us where you&rsquo;re headed</div>
                  <div className={s.welcomeStepSub}>Your target score, test date, and how much prep you&rsquo;ve done.</div>
                </div>
              </li>
              <li className={s.welcomeStep}>
                <span className={s.welcomeStepNum}>2</span>
                <div>
                  <div className={s.welcomeStepTitle}>Tell us when you can study</div>
                  <div className={s.welcomeStepSub}>Hours a week and which days — the plan fits around your life.</div>
                </div>
              </li>
              <li className={s.welcomeStep}>
                <span className={s.welcomeStepNum}>3</span>
                <div>
                  <div className={s.welcomeStepTitle}>See your plan and start</div>
                  <div className={s.welcomeStepSub}>About two minutes. Everything can be changed later.</div>
                </div>
              </li>
            </ol>
          </section>
        )}

        {isQuestion && copy && (
          <section className={`${s.card} ${s.questionCard} ${step === 'assess' || step === 'targets' ? s.questionCardWide : ''}`}>
            <div className={s.questionHead}>
              <h1 className={s.question}>{copy.title}</h1>
              {copy.sub && <p className={s.questionSub}>{copy.sub}</p>}
            </div>
            <div className={s.questionBody}>
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
              <SelfCheckGrid action={saveAssessmentAction} rows={selfCheckRows} defaults={intake.selfRating} />
            )}
            </div>

            <div className={s.navRow}>
              {prevStep ? (
                <Link href={`/welcome?step=${prevStep}`} className={s.backLink}>← Back</Link>
              ) : (
                <Link href="/welcome?step=welcome" className={s.backLink}>← Back</Link>
              )}
              {showSetAside && <SetAsideLink action={setAsideAction} />}
            </div>
          </section>
        )}

        {step === 'build' && (
          <section className={s.card}>
            <h1 className={s.question}>Ready when you are</h1>
            <p className={s.questionSub}>
              Target <strong>{goal}</strong> · test on <strong>{testDate}</strong> · about{' '}
              <strong>{intake.weeklyHours}</strong> hours a week.{' '}
              <Link href="/welcome?step=target" className={s.inlineLink}>Change an answer</Link>
            </p>
            <BuildPlanButton action={buildPlanAction} />
          </section>
        )}

        {step === 'preview' && draft && (
          <section className={`${s.card} ${s.reviewCard}`}>
            <h1 className={s.question}>Here&rsquo;s your plan</h1>
            <p className={s.questionSub}>Open any week to see what&rsquo;s in it, then start whenever you&rsquo;re ready.</p>
            <PlanOverview
              goalScore={draft.goal_score ?? goal ?? 0}
              testDate={draft.test_date ?? testDate ?? ''}
              mode={(draft.mode as PlanMode | null) ?? null}
              rationale={draft.rationale ?? null}
              rationaleCollapsed
              phases={normalizePhases(draft.phases)}
              tasks={draftTasks}
              expandWeeks={1}
            />
            <div className={`${s.actionsRow} ${s.previewActions}`}>
              <ActivateFirstPlanButton action={activateFirstPlanAction} planId={draft.id} />
              <span className={s.skipLink}>
                <Link href="/welcome?step=target" className={s.inlineLink}>Change an answer</Link>
                {' · '}
                <RebuildPlanLink action={buildPlanAction} />
              </span>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
