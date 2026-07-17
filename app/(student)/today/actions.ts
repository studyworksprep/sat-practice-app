// Server Actions for the student "Today" page (§2.3).
//
// startPlanTask is the one-tap start: it turns a pending plan task into
// the right next screen, stamping plan_task_id onto anything it spawns so
// the §2.1 completion triggers can mark the task done automatically:
//
//   drill / practice_set → build a practice_session from the task's
//        filter_criteria (skill/domain codes straight off questions_v2's
//        inline taxonomy), plan_task_id set → session runner. Completion
//        is automatic (trg_plan_task_from_session).
//   full_test → the test hub (or the specific test when the payload names
//        one). Completion is automatic via the natural full_test match.
//   lesson → the specific lesson when payload/lesson_topics resolve one,
//        else the Learn library filtered to the task's domain.
//   review → a session built from the §3.1 spaced-repetition queue (due
//        questions + decayed-skill micro-drills; weak-queue fallback),
//        plan_task_id set → completion is automatic. Falls back to the
//        hub only when there's nothing to draw.
//   vocab / flashcards → their hubs.
//
// Lessons/vocab/flashcards (and a dry-queue review) have no completion
// event, so those tasks carry a manual "Mark done" (markTaskDone,
// completed_via='manual') — the schema documented exactly this escape
// hatch.
//
// Both actions are plain <form action> handlers: on failure they redirect
// back to /today?error=… (no client island needed); on success they
// redirect to the started surface. Ownership: Today is the student's own
// surface, so both assert the task's plan belongs to the CALLER and is
// active — tighter than the tutor-manageable RLS floor.

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/api/auth';
import { rateLimit } from '@/lib/api/rateLimit';
import { MANUAL_COMPLETE_TYPES } from '@/lib/plan/today';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import {
  buildReviewSessionQuestionIds,
  getDueReviewItems,
  syncDecayedSkillReviews,
} from '@/lib/review/queue';
// Weak-queue is the fallback when the SRS queue is dry — its priority
// scoring is the same intake policy the queue itself grew out of.
import { buildWeakQueue, selectDrillQuestionIds } from '@/lib/practice/weak-queue';
import type { PlanTaskType } from '@/lib/plan/generate-plan';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_DRILL_COUNT = 8;
const MAX_DRILL_COUNT = 50;
const REVIEW_TASK_SIZE = 10;

function fail(message: string): never {
  redirect(`/today?error=${encodeURIComponent(message)}`);
}

function str(obj: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = obj?.[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

function num(obj: Record<string, unknown> | null | undefined, key: string): number | null {
  const v = obj?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Load a pending task + assert it belongs to the caller's ACTIVE plan. */
async function loadOwnPendingTask(
  supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
  userId: string,
  taskId: string,
) {
  const { data: taskRow } = await supabase
    .from('plan_tasks')
    .select('id, plan_id, task_type, payload, status')
    .eq('id', taskId)
    .maybeSingle();
  if (!taskRow) fail('That task could not be found.');

  const { data: plan } = await supabase
    .from('study_plans')
    .select('id, student_id, status, test_type')
    .eq('id', taskRow.plan_id)
    .maybeSingle();
  if (!plan || plan.student_id !== userId) fail('That task could not be found.');
  if (plan.status !== 'active') fail('That task belongs to an inactive plan.');
  if (taskRow.status !== 'pending') fail('That task is already done.');

  return {
    task: {
      id: taskRow.id,
      taskType: taskRow.task_type as PlanTaskType,
      payload: (taskRow.payload ?? {}) as Record<string, unknown>,
    },
    plan: { id: plan.id, testType: (plan.test_type ?? 'sat') as 'sat' | 'act' },
  };
}

export async function startPlanTask(formData: FormData): Promise<void> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch {
    redirect('/login');
  }
  const { user, supabase } = ctx;

  const taskId = String(formData.get('task_id') ?? '');
  if (!UUID_RE.test(taskId)) fail('Invalid task.');

  const { task, plan } = await loadOwnPendingTask(supabase, user.id, taskId);
  const payload = task.payload;

  switch (task.taskType) {
    case 'drill':
    case 'practice_set': {
      // The drill selector reads questions_v2 (SAT). ACT plans can't be
      // generated yet (the seeded curriculum is SAT-only), so refuse
      // rather than build an ACT session out of SAT question ids.
      if (plan.testType !== 'sat') {
        fail('ACT drills are not supported yet.');
      }
      // Shares the practice-start budget so plan starts can't bypass it.
      const rl = await rateLimit(`practice-start:${user.id}`, { limit: 20, windowMs: 60_000 });
      if (!rl.ok) fail('Too many session starts. Please wait a moment and try again.');

      const fc = (payload.filter_criteria ?? {}) as Record<string, unknown>;
      const skillCode = str(fc, 'skill_code') ?? str(payload, 'skill_code');
      const domainCode = str(fc, 'domain_code') ?? str(payload, 'domain_code');
      if (!skillCode && !domainCode) {
        fail('This drill has no skill attached — ask your tutor to fix it.');
      }
      const count = Math.min(
        Math.max(num(fc, 'count') ?? DEFAULT_DRILL_COUNT, 1),
        MAX_DRILL_COUNT,
      );

      // Candidates from the inline v2 taxonomy, in the deterministic
      // display_code walk the practice launcher also defaults to.
      let query = supabase
        .from('questions_v2')
        .select('id, display_code')
        .eq('is_published', true)
        .eq('is_broken', false)
        .is('deleted_at', null)
        .order('display_code', { ascending: true })
        .limit(500);
      query = skillCode ? query.eq('skill_code', skillCode) : query.eq('domain_code', domainCode!);
      const { data: candidates, error: qErr } = await query;
      if (qErr) fail(`Could not load questions: ${qErr.message}`);
      const candidateIds = (candidates ?? []).map((r) => r.id);
      if (candidateIds.length === 0) {
        fail('No published questions match this drill right now.');
      }

      // Unanswered first, then already-answered to fill the count — a
      // drill should stretch the student before it repeats them.
      const { data: answered } = await supabase
        .from('attempts')
        .select('question_id')
        .eq('user_id', user.id)
        .in('question_id', candidateIds);
      const answeredSet = new Set((answered ?? []).map((r) => r.question_id));
      const fresh = candidateIds.filter((id) => !answeredSet.has(id));
      const repeats = candidateIds.filter((id) => answeredSet.has(id));
      const questionIds = [...fresh, ...repeats].slice(0, count);

      const { data: session, error: insErr } = await supabase
        .from('practice_sessions')
        .insert({
          user_id: user.id,
          test_type: plan.testType,
          mode: 'practice',
          question_ids: questionIds,
          current_position: 0,
          plan_task_id: task.id,
          filter_criteria: {
            source: 'study_plan',
            plan_task_id: task.id,
            skill_code: skillCode,
            domain_code: domainCode,
            count,
            actual_size: questionIds.length,
          },
        })
        .select('id')
        .single();
      if (insErr || !session) {
        fail(`Could not start the drill: ${insErr?.message ?? 'unknown error'}`);
      }
      redirect(`/practice/s/${session.id}/0`);
      break;
    }

    case 'full_test': {
      const testId = str(payload, 'practice_test_id');
      // Completion rides the natural full_test match — any completed
      // full test satisfies the earliest pending checkpoint.
      redirect(testId ? `/practice/test/${testId}` : '/practice/tests');
      break;
    }

    case 'lesson': {
      const lessonId = str(payload, 'lesson_id');
      if (lessonId && UUID_RE.test(lessonId)) redirect(`/learn/${lessonId}`);

      // Resolve by skill code via lesson_topics (§3.3's join key).
      const skillCode = str(payload, 'skill_code');
      if (skillCode) {
        const { data: topics } = await supabase
          .from('lesson_topics')
          .select('lesson_id')
          .eq('skill_code', skillCode)
          .limit(10);
        const ids = (topics ?? []).map((t) => t.lesson_id);
        if (ids.length > 0) {
          const { data: lessons } = await supabase
            .from('lessons')
            .select('id')
            .in('id', ids)
            .eq('status', 'published')
            .limit(1);
          if (lessons?.[0]) redirect(`/learn/${lessons[0].id}`);
        }
      }

      // Fall back to the library, filtered to the task's domain.
      const domainCode = str(payload, 'domain_code');
      const domainName = SAT_TAXONOMY.find((d) => d.code === domainCode)?.name;
      redirect(domainName ? `/learn?domain=${encodeURIComponent(domainName)}` : '/learn');
      break;
    }

    case 'review': {
      // §3.1: a plan review task draws from the spaced-repetition
      // queue — due question items plus micro-drills for decayed
      // skills — and runs as a normal mode='review' session with
      // plan_task_id stamped, so trg_plan_task_from_session finally
      // completes review tasks automatically. When the queue (and the
      // weak-queue fallback) is dry, fall through to the hub, where
      // the manual "Mark done" escape hatch still applies.
      if (plan.testType !== 'sat') {
        redirect('/review');
      }
      const rl = await rateLimit(`practice-start:${user.id}`, { limit: 20, windowMs: 60_000 });
      if (!rl.ok) fail('Too many session starts. Please wait a moment and try again.');

      const nowIso = new Date().toISOString();
      try {
        await syncDecayedSkillReviews(supabase, user.id);
      } catch { /* best-effort — question items still flow */ }
      const due = await getDueReviewItems(supabase, user.id, nowIso);
      let questionIds = await buildReviewSessionQuestionIds(
        supabase, user.id, due, REVIEW_TASK_SIZE,
      );
      if (questionIds.length === 0) {
        const scored = await buildWeakQueue(supabase, user.id);
        questionIds = selectDrillQuestionIds(scored, REVIEW_TASK_SIZE);
      }
      if (questionIds.length === 0) {
        redirect('/review');
      }

      const { data: session, error: insErr } = await supabase
        .from('practice_sessions')
        .insert({
          user_id: user.id,
          test_type: 'sat',
          mode: 'review',
          question_ids: questionIds,
          current_position: 0,
          plan_task_id: task.id,
          filter_criteria: {
            kind: 'srs_due',
            source: 'study_plan',
            plan_task_id: task.id,
            size: questionIds.length,
          },
        })
        .select('id')
        .single();
      if (insErr || !session) {
        fail(`Could not start the review: ${insErr?.message ?? 'unknown error'}`);
      }
      redirect(`/practice/s/${session.id}/0`);
      break;
    }

    case 'vocab':
      redirect('/review');
      break;

    case 'flashcards':
      redirect('/flashcards');
      break;

    default:
      fail('This task type cannot be started yet.');
  }
}

export async function markTaskDone(formData: FormData): Promise<void> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch {
    redirect('/login');
  }
  const { user, supabase } = ctx;

  const taskId = String(formData.get('task_id') ?? '');
  if (!UUID_RE.test(taskId)) fail('Invalid task.');

  const { task } = await loadOwnPendingTask(supabase, user.id, taskId);
  if (!MANUAL_COMPLETE_TYPES.includes(task.taskType)) {
    // Drills and full tests complete themselves when the linked work is
    // finished — no hand-checking past the actual practice.
    fail('This task completes automatically when you finish the work.');
  }

  const { error } = await supabase
    .from('plan_tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_via: 'manual',
    })
    .eq('id', task.id)
    .eq('status', 'pending');
  if (error) fail(`Could not mark the task done: ${error.message}`);

  revalidatePath('/today');
  redirect('/today');
}
