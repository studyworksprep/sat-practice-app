// review_queue data layer (upgrade plan §3.1). Thin, server-side
// wrappers around the review_queue table — the scheduling math lives
// in ./schedule.ts (pure), this module owns the reads/writes and the
// intake policies:
//
//   recordQuestionOutcome  — every first-in-window practice answer
//        flows through here (submitAnswer defers to it via after()):
//        wrong answers enqueue at the lapse floor, correct answers
//        advance an already-queued question and are otherwise ignored
//        (getting something right the first time is not review intake).
//   syncDecayedSkillReviews — reconciles skill-level micro-drill items
//        against the §1.3 coverage function: 'decayed' units enqueue,
//        recovered units leave the queue. Self-healing by design — the
//        coverage function owns the retention signal, so queue
//        membership follows it rather than tracking its own state.
//   recordFlashcardRating  — flashcard self-ratings feed due-date
//        scheduling (replacing weighted-random as the selection
//        policy; the rating scale stays the student-facing 0..5).
//
// All writes are best-effort from the caller's perspective: callers
// wrap these in after()/try-catch because a queue bookkeeping failure
// must never break the answer/rating that triggered it.

import {
  isDue,
  masteryToResult,
  nextSchedule,
} from './schedule';
import type { ReviewItemType, ReviewScheduleState } from './schedule';
import type { TypedSupabaseClient } from '@/lib/supabase/server';

const QUEUE_CONFLICT_KEY = 'student_id,item_type,item_ref';

/** How many skill micro-drill questions a due skill item contributes
 *  to a review session. */
const SKILL_MICRO_DRILL_COUNT = 3;
/** At most this many due skills fold into one review session — the
 *  rest wait their turn so a session stays a session, not a test. */
const MAX_SKILLS_PER_SESSION = 2;

export interface ReviewQueueItem {
  id: string;
  itemType: ReviewItemType;
  itemRef: string;
  dueAt: string;
  state: ReviewScheduleState;
}

type QueueRow = {
  id: string;
  item_type: string;
  item_ref: string;
  due_at: string;
  interval_days: number;
  ease: number;
  lapses: number;
};

function toItem(row: QueueRow): ReviewQueueItem {
  return {
    id: row.id,
    itemType: row.item_type as ReviewItemType,
    itemRef: row.item_ref,
    dueAt: row.due_at,
    state: {
      intervalDays: Number(row.interval_days),
      ease: Number(row.ease),
      lapses: row.lapses,
    },
  };
}

async function fetchItem(
  supabase: TypedSupabaseClient,
  userId: string,
  itemType: ReviewItemType,
  itemRef: string,
): Promise<ReviewQueueItem | null> {
  const { data } = await supabase
    .from('review_queue')
    .select('id, item_type, item_ref, due_at, interval_days, ease, lapses')
    .eq('student_id', userId)
    .eq('item_type', itemType)
    .eq('item_ref', itemRef)
    .maybeSingle();
  return data ? toItem(data as QueueRow) : null;
}

async function upsertSchedule(
  supabase: TypedSupabaseClient,
  userId: string,
  itemType: ReviewItemType,
  itemRef: string,
  prev: ReviewScheduleState | null,
  result: 'again' | 'good' | 'easy',
  nowIso: string,
): Promise<void> {
  const next = nextSchedule(prev, result, nowIso);
  await supabase.from('review_queue').upsert(
    {
      student_id: userId,
      item_type: itemType,
      item_ref: itemRef,
      due_at: next.dueAtIso,
      interval_days: next.intervalDays,
      ease: next.ease,
      lapses: next.lapses,
      last_result: next.lastResult,
      last_reviewed_at: next.lastReviewedAtIso,
    },
    { onConflict: QUEUE_CONFLICT_KEY },
  );
}

/**
 * Queue bookkeeping for a newly recorded practice attempt. Only called
 * when submitAnswer actually inserted an attempt (first-attempt-wins),
 * so repeated answers inside one session can't inflate the schedule.
 */
export async function recordQuestionOutcome(
  supabase: TypedSupabaseClient,
  userId: string,
  questionId: string,
  isCorrect: boolean,
  nowIso: string,
): Promise<void> {
  const existing = await fetchItem(supabase, userId, 'question', questionId);
  if (!existing && isCorrect) return;
  await upsertSchedule(
    supabase, userId, 'question', questionId,
    existing?.state ?? null,
    isCorrect ? 'good' : 'again',
    nowIso,
  );
}

/** Flashcard self-rating → due-date schedule. Every rated card enters
 *  the queue: a low rating comes back tomorrow, a confident one
 *  schedules a far-out check instead of staying in random rotation. */
export async function recordFlashcardRating(
  supabase: TypedSupabaseClient,
  userId: string,
  cardId: string,
  mastery: number,
  nowIso: string,
): Promise<void> {
  const existing = await fetchItem(supabase, userId, 'flashcard', cardId);
  await upsertSchedule(
    supabase, userId, 'flashcard', cardId,
    existing?.state ?? null,
    masteryToResult(mastery),
    nowIso,
  );
}

/** Referential cleanup — e.g. deleting a flashcard removes its queue
 *  row (item_ref carries no FK; the app layer owns this). */
export async function removeQueueItem(
  supabase: TypedSupabaseClient,
  userId: string,
  itemType: ReviewItemType,
  itemRef: string,
): Promise<void> {
  await supabase
    .from('review_queue')
    .delete()
    .eq('student_id', userId)
    .eq('item_type', itemType)
    .eq('item_ref', itemRef);
}

/**
 * Reconcile skill-level review items against the coverage function
 * (§1.3): every 'decayed' unit gets a skill item (due immediately on
 * first sighting), and items whose unit has recovered are removed.
 * SAT-only — get_student_coverage is keyed to the SAT curriculum.
 */
export async function syncDecayedSkillReviews(
  supabase: TypedSupabaseClient,
  userId: string,
): Promise<void> {
  const [{ data: coverage }, { data: skillRows }] = await Promise.all([
    supabase.rpc('get_student_coverage', { p_student: userId, p_test_type: 'sat' }),
    supabase
      .from('review_queue')
      .select('id, item_ref')
      .eq('student_id', userId)
      .eq('item_type', 'skill'),
  ]);
  if (!coverage) return;

  const decayed = new Set(
    coverage
      .filter((r) => r.status === 'decayed' && r.skill_code)
      .map((r) => r.skill_code as string),
  );
  const queued = new Set((skillRows ?? []).map((r) => r.item_ref));

  const toInsert = [...decayed].filter((code) => !queued.has(code));
  if (toInsert.length > 0) {
    // Defaults put the item due now at the base interval — the first
    // *scheduled* state is written when the skill is actually reviewed.
    await supabase.from('review_queue').upsert(
      toInsert.map((code) => ({
        student_id: userId,
        item_type: 'skill',
        item_ref: code,
      })),
      { onConflict: QUEUE_CONFLICT_KEY, ignoreDuplicates: true },
    );
  }

  const toRemove = (skillRows ?? [])
    .filter((r) => !decayed.has(r.item_ref))
    .map((r) => r.id);
  if (toRemove.length > 0) {
    await supabase.from('review_queue').delete().in('id', toRemove);
  }
}

/** The student's due items, oldest due first. */
export async function getDueReviewItems(
  supabase: TypedSupabaseClient,
  userId: string,
  nowIso: string,
  limit = 200,
): Promise<ReviewQueueItem[]> {
  const { data } = await supabase
    .from('review_queue')
    .select('id, item_type, item_ref, due_at, interval_days, ease, lapses')
    .eq('student_id', userId)
    .lte('due_at', nowIso)
    .order('due_at', { ascending: true })
    .limit(limit);
  return ((data ?? []) as QueueRow[]).map(toItem);
}

export interface DueSummary {
  questions: number;
  skills: number;
  flashcards: number;
  total: number;
}

export function summarizeDue(items: readonly ReviewQueueItem[]): DueSummary {
  const questions = items.filter((i) => i.itemType === 'question').length;
  const skills = items.filter((i) => i.itemType === 'skill').length;
  const flashcards = items.filter((i) => i.itemType === 'flashcard').length;
  return { questions, skills, flashcards, total: items.length };
}

/**
 * Turn due queue items into a review session's question list: due
 * question items first (validated against the published/not-broken
 * gate), then micro-drills for up to MAX_SKILLS_PER_SESSION due
 * skills — least-recently-attempted questions in the skill, so a
 * decayed skill's refresher isn't the same three questions forever.
 *
 * Question items advance when the student answers them (the normal
 * submitAnswer path); skill items clear when the coverage function
 * stops reporting the unit as decayed (syncDecayedSkillReviews).
 */
export async function buildReviewSessionQuestionIds(
  supabase: TypedSupabaseClient,
  userId: string,
  dueItems: readonly ReviewQueueItem[],
  size: number,
): Promise<string[]> {
  const chosen: string[] = [];
  const seen = new Set<string>();

  const questionRefs = dueItems
    .filter((i) => i.itemType === 'question')
    .map((i) => i.itemRef);
  if (questionRefs.length > 0) {
    const { data: valid } = await supabase
      .from('questions_v2')
      .select('id')
      .in('id', questionRefs.slice(0, Math.max(size * 2, 50)))
      .eq('is_published', true)
      .eq('is_broken', false)
      .is('deleted_at', null);
    const validSet = new Set((valid ?? []).map((r) => r.id));
    for (const ref of questionRefs) {
      if (chosen.length >= size) break;
      if (validSet.has(ref) && !seen.has(ref)) {
        chosen.push(ref);
        seen.add(ref);
      }
    }
  }

  const skillCodes = dueItems
    .filter((i) => i.itemType === 'skill')
    .slice(0, MAX_SKILLS_PER_SESSION)
    .map((i) => i.itemRef);
  for (const skillCode of skillCodes) {
    if (chosen.length >= size) break;
    const { data: candidates } = await supabase
      .from('questions_v2')
      .select('id')
      .eq('skill_code', skillCode)
      .eq('is_published', true)
      .eq('is_broken', false)
      .is('deleted_at', null)
      .order('display_code', { ascending: true })
      .limit(50);
    const candidateIds = (candidates ?? [])
      .map((r) => r.id)
      .filter((id) => !seen.has(id));
    if (candidateIds.length === 0) continue;

    // Least-recently-attempted first (never-attempted counts as oldest).
    const { data: attempts } = await supabase
      .from('attempts')
      .select('question_id, created_at')
      .eq('user_id', userId)
      .in('question_id', candidateIds)
      .order('created_at', { ascending: false });
    const lastAttemptAt = new Map<string, string>();
    for (const a of attempts ?? []) {
      if (!lastAttemptAt.has(a.question_id)) {
        lastAttemptAt.set(a.question_id, a.created_at);
      }
    }
    const ranked = [...candidateIds].sort((a, b) =>
      (lastAttemptAt.get(a) ?? '').localeCompare(lastAttemptAt.get(b) ?? ''),
    );
    for (const id of ranked.slice(0, SKILL_MICRO_DRILL_COUNT)) {
      if (chosen.length >= size) break;
      chosen.push(id);
      seen.add(id);
    }
  }

  return chosen;
}

export { isDue };
