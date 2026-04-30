// Server-side loader for the /review/error-log page. Returns
// the user's error-log entries newest-first, joined with the
// question's taxonomy + accuracy summary so the row can render
// without any extra client-side fetch.
//
// Lives next to the Server Actions but separate because it's
// invoked from a Server Component (page.js) — calling a Server
// Action from an RSC would route through the action machinery
// unnecessarily. Same loose-typed `supabase` parameter shape as
// load-concept-tags / load-question-notes for consistency.

/**
 * @param {object} args
 * @param {*} args.supabase — server-side Supabase client.
 * @param {string} args.userId
 * @param {number} [args.limit=200]
 * @returns {Promise<Array<{
 *   questionId: string,
 *   body: string,
 *   updatedAt: string,
 *   externalId: string | null,
 *   domainCode: string | null,
 *   domainName: string | null,
 *   skillName: string | null,
 *   difficulty: number | null,
 *   attempts: number,
 *   correct: number,
 *   lastIsCorrect: boolean | null,
 * }>>}
 */
export async function loadErrorNotes({ supabase, userId, limit = 200 }) {
  const { data: noteRows } = await supabase
    .from('question_error_notes')
    .select('question_id, body, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (!noteRows || noteRows.length === 0) return [];

  const qids = noteRows.map((r) => r.question_id);

  // Join the taxonomy + accuracy in two parallel reads. The
  // taxonomy is on questions_v2 (current shape); accuracy comes
  // from attempts where we count + check the latest is_correct.
  const [{ data: questionRows }, { data: attemptRows }] = await Promise.all([
    supabase
      .from('questions_v2')
      .select('id, display_code, domain_code, domain_name, skill_name, difficulty')
      .in('id', qids),
    supabase
      .from('attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', userId)
      .in('question_id', qids)
      .order('created_at', { ascending: false }),
  ]);

  const qById = new Map();
  for (const q of questionRows ?? []) qById.set(q.id, q);

  // For each question, count total + correct attempts and pick
  // the latest is_correct for the per-row badge.
  const statsByQid = new Map();
  for (const a of attemptRows ?? []) {
    const qid = a.question_id;
    const existing = statsByQid.get(qid) ?? { attempts: 0, correct: 0, latest: null };
    existing.attempts += 1;
    if (a.is_correct) existing.correct += 1;
    // attemptRows is ordered desc by created_at, so the first
    // hit per qid is the latest.
    if (existing.latest === null) existing.latest = !!a.is_correct;
    statsByQid.set(qid, existing);
  }

  return noteRows.map((row) => {
    const q = qById.get(row.question_id);
    const stat = statsByQid.get(row.question_id);
    return {
      questionId: row.question_id,
      body: row.body,
      updatedAt: row.updated_at,
      externalId: q?.display_code ?? null,
      domainCode: q?.domain_code ?? null,
      domainName: q?.domain_name ?? null,
      skillName: q?.skill_name ?? null,
      difficulty: q?.difficulty ?? null,
      attempts: stat?.attempts ?? 0,
      correct: stat?.correct ?? 0,
      lastIsCorrect: stat?.latest ?? null,
    };
  });
}
