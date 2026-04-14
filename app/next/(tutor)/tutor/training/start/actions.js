// Server Actions for the tutor training start page. See
// docs/architecture-plan.md §3.4.
//
// createTrainingSession is nearly identical to the student
// createSession: same candidate query, same Fisher-Yates shuffle,
// same practice_sessions insert. The three differences from the
// student flow:
//
//   - mode: 'training' instead of 'practice' on the session row
//   - redirect to /tutor/training/s/... instead of /practice/s/...
//   - rate-limit bucket prefix distinguishes the two in the
//     limiter's key space (tutor training isn't gated against a
//     shared quota with the tutor's own practice attempts — they
//     shouldn't have practice attempts at all)
//
// The grading action (submitAnswer) is shared with the student
// flow via lib/practice/session-actions.js — both trees import
// the same function because they do identical work.

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';

const MAX_SESSION_SIZE = 25;

export async function createTrainingSession(_prevState, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, profile, supabase } = ctx;

  // Defense in depth — the page already gates the role, but the
  // Server Action must re-check because actions can be called from
  // anywhere a client holds a reference.
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    return actionFail('Training mode is for tutors only.');
  }

  const rl = await rateLimit(`training-start:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return actionFail('Too many session starts. Please wait a moment and try again.');
  }

  const domains = formData.getAll('domain').filter(Boolean).map(String);
  const difficulties = formData
    .getAll('difficulty')
    .map((d) => Number(d))
    .filter(Number.isFinite);
  const skills = formData.getAll('skill').filter(Boolean).map(String);
  const rawSize = Number(formData.get('size') ?? 10);
  const size = Math.min(
    Math.max(Number.isFinite(rawSize) ? Math.floor(rawSize) : 10, 1),
    MAX_SESSION_SIZE,
  );

  let query = supabase
    .from('question_taxonomy')
    .select('question_id, questions!inner(id, is_broken, is_test_only, status)')
    .eq('program', 'SAT')
    .eq('questions.is_broken', false)
    .eq('questions.is_test_only', false)
    .eq('questions.status', 'active');

  if (domains.length) query = query.in('domain_name', domains);
  if (difficulties.length) query = query.in('difficulty', difficulties);
  if (skills.length) query = query.in('skill_name', skills);

  const { data: candidates, error: candErr } = await query.limit(2000);
  if (candErr) {
    return actionFail(`Failed to load candidate questions: ${candErr.message}`);
  }
  if (!candidates || candidates.length === 0) {
    return actionFail('No questions match those filters. Try a broader selection.');
  }

  // Fisher-Yates shuffle
  const ids = candidates.map((row) => row.question_id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const questionIds = ids.slice(0, size);

  const { data: session, error: insertErr } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: user.id,
      test_type: 'sat',
      mode: 'training',
      question_ids: questionIds,
      current_position: 0,
      filter_criteria: {
        domains,
        difficulties,
        skills,
        size,
      },
    })
    .select('id')
    .single();

  if (insertErr || !session) {
    return actionFail(`Failed to create session: ${insertErr?.message ?? 'unknown'}`);
  }

  redirect(`/tutor/training/s/${session.id}/0`);
}
