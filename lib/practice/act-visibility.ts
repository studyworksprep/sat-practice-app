// Student-facing visibility gate for act_questions.
//
// A question is invisible to students when it is flagged broken
// (is_broken — hidden pending a fix) OR retired (deleted_at — the
// admin editor's soft delete, migration 20261010120000). Every
// picker and hub that offers ACT questions to a student applies this
// one helper so the two flags can't drift apart across readers.
// Readers that resolve ids a student already holds (session
// payloads, review reports, notes) deliberately do NOT use it: they
// still render the row, marked removed where the UI has that notion.

export const ACT_VISIBLE_SELECT_COLUMNS = 'is_broken, deleted_at' as const;

/** Apply the student-visibility predicate to an act_questions
 *  query builder. Returns the same builder for chaining. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function visibleActQuestions<Q extends { eq: any; is: any }>(query: Q): Q {
  return query.eq('is_broken', false).is('deleted_at', null) as Q;
}

/** Row-level check for readers that fetch the flags themselves. */
export function isActQuestionVisible(row: {
  is_broken?: boolean | null;
  deleted_at?: string | null;
}): boolean {
  return !row.is_broken && row.deleted_at == null;
}
