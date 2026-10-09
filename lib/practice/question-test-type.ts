// Resolve which test a question id belongs to.
//
// The shared tables (question_error_notes, desmos_saved_states,
// question_notes, student_notes) carry a `test_type` discriminator
// because the same question_id column can point at questions_v2
// (SAT) or act_questions (ACT). Readers filter on it, so a writer
// that stamps the wrong value makes the row invisible — the note
// "saves" and then vanishes on reload. See docs/architecture-plan.md
// §3.4 "Cross-test data model".
//
// Writers derive the type server-side from the id itself rather
// than trusting a client-supplied flag: UUIDs are globally unique
// across the two tables, so a single primary-key probe settles it.
// act_questions is readable by every authenticated role, so the
// probe works under the caller's RLS-scoped client.

import type { TestType } from '@/lib/types';

export async function resolveQuestionTestType(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  questionId: string,
): Promise<TestType> {
  if (!questionId) return 'sat';
  const { data } = await supabase
    .from('act_questions')
    .select('id')
    .eq('id', questionId)
    .maybeSingle();
  return data?.id ? 'act' : 'sat';
}
