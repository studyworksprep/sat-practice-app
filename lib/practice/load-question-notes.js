// Server-side loader for the per-question tutor-notes surface.
// Powers the new-tree QuestionNotes island so it doesn't need a
// useEffect+fetch on mount.
//
// Visibility model (mirrors app/api/question-notes/route.js's
// getVisibleAuthorIds, intentionally duplicated rather than
// imported from the API route — that route disappears with the
// legacy tree retirement, this loader is the surviving home):
//   - Admin: sees every note.
//   - Manager: sees their own notes + their assigned teachers'
//     notes + every admin's notes.
//   - Teacher: sees their own + their manager's + sibling teachers
//     under the same manager + every admin's.
//   - Teacher with no manager: sees their own + every admin's.
//   - Anyone else (student / practice): sees nothing.
//
// Cross-org reads use the service client because RLS on profiles
// would otherwise block teachers from resolving their manager and
// sibling teachers' identities.

import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/api/logger';

// Audit-parity shim: these loaders bypass RLS with a raw service
// client instead of requireServiceRole because (a) they are pure
// reads whose author-visibility filtering happens in code below, and
// (b) requireServiceRole's demo-account gate would break the demo
// tour, which renders the report surfaces that call these loaders.
// They still emit the same structured service_role_bypass event the
// wrapper logs, so RLS bypasses stay auditable in one place.
function auditServiceRead(reason, userId) {
  logger.info(
    { event: 'service_role_bypass', reason, user_id: userId ?? null, caller_role: 'loader' },
    'service_role_bypass',
  );
  return createServiceClient();
}

const TUTOR_ROLES = new Set(['teacher', 'manager', 'admin']);

/**
 * @param {object} args
 * @param {string} args.questionId
 * @param {string} args.role - caller's profile.role
 * @param {string} args.userId - caller's profile.id
 * @param {'sat'|'act'} [args.testType] - which test the question
 *   belongs to. Defaults to 'sat' so existing callers keep working;
 *   the ACT loader fork passes 'act' explicitly.
 * @returns {Promise<{
 *   notes: Array<object>,
 *   isAdmin: boolean,
 *   currentUserId: string,
 *   canView: boolean,
 * }>}
 */
export async function loadQuestionNotes({ questionId, role, userId, testType = 'sat' }) {
  if (!TUTOR_ROLES.has(role) || !questionId || !userId) {
    return { notes: [], isAdmin: false, currentUserId: userId, canView: false };
  }

  const visibleAuthorIds = await getVisibleAuthorIds({ role, userId });

  // Service-client read so we can resolve every author profile
  // — manager / teacher row visibility through the calling user's
  // RLS-scoped client would drop notes from authors they can't
  // see directly. test_type discriminates between SAT (questions_v2)
  // and ACT (act_questions) keys; the same question_notes table
  // serves both, scoped by the column added in PR 1.
  const svc = auditServiceRead('question-notes cross-author read', userId);
  const { data: rawNotes } = await svc
    .from('question_notes')
    .select(
      'id, question_id, author_id, content, created_at, updated_at, ' +
      'profiles:author_id(first_name, last_name, email, role)',
    )
    .eq('question_id', questionId)
    .eq('test_type', testType)
    .order('created_at', { ascending: true });

  const filtered = visibleAuthorIds
    ? (rawNotes ?? []).filter((n) => visibleAuthorIds.has(n.author_id))
    : (rawNotes ?? []);

  return {
    notes: filtered.map(shapeNote),
    isAdmin: role === 'admin',
    currentUserId: userId,
    canView: true,
  };
}

/**
 * Batched variant for surfaces that render many questions in
 * one shot (session review, practice-test results). Returns a
 * Map keyed by question_id → notes[].
 *
 * @param {object} args
 * @param {string[]} args.questionIds
 * @param {string} args.role
 * @param {string} args.userId
 * @param {'sat'|'act'} [args.testType] - defaults to 'sat'.
 */
export async function loadQuestionNotesByQuestion({ questionIds, role, userId, testType = 'sat' }) {
  const empty = { notesByQid: new Map(), isAdmin: false, currentUserId: userId, canView: false };
  if (!TUTOR_ROLES.has(role) || !userId) return empty;
  const ids = (questionIds ?? []).filter(Boolean);
  if (ids.length === 0) return { ...empty, canView: true, isAdmin: role === 'admin' };

  const visibleAuthorIds = await getVisibleAuthorIds({ role, userId });

  // Same per-question scope as loadQuestionNotes; test_type forks
  // SAT vs ACT note keys against the discriminator column.
  const svc = auditServiceRead('question-notes batched cross-author read', userId);
  const { data: rawNotes } = await svc
    .from('question_notes')
    .select(
      'id, question_id, author_id, content, created_at, updated_at, ' +
      'profiles:author_id(first_name, last_name, email, role)',
    )
    .in('question_id', ids)
    .eq('test_type', testType)
    .order('created_at', { ascending: true });

  const notesByQid = new Map();
  for (const n of rawNotes ?? []) {
    if (visibleAuthorIds && !visibleAuthorIds.has(n.author_id)) continue;
    const arr = notesByQid.get(n.question_id) ?? [];
    arr.push(shapeNote(n));
    notesByQid.set(n.question_id, arr);
  }

  return {
    notesByQid,
    isAdmin: role === 'admin',
    currentUserId: userId,
    canView: true,
  };
}

function shapeNote(row) {
  const p = row.profiles ?? {};
  return {
    id: row.id,
    questionId: row.question_id,
    authorId: row.author_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorName: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unknown',
    authorRole: p.role ?? null,
  };
}

/**
 * Resolve which note authors the caller is allowed to see, by
 * org-walking through manager_teacher_assignments. Returns null
 * for admins (meaning "see all"); a Set otherwise.
 */
async function getVisibleAuthorIds({ role, userId }) {
  if (role === 'admin') return null;

  const svc = auditServiceRead('question-notes author-visibility walk', userId);
  const ids = new Set([userId]);

  const { data: admins } = await svc
    .from('profiles')
    .select('id')
    .eq('role', 'admin');
  for (const a of admins ?? []) ids.add(a.id);

  if (role === 'manager') {
    const { data: assignments } = await svc
      .from('manager_teacher_assignments')
      .select('teacher_id')
      .eq('manager_id', userId);
    for (const a of assignments ?? []) ids.add(a.teacher_id);
  } else if (role === 'teacher') {
    const { data: myManagers } = await svc
      .from('manager_teacher_assignments')
      .select('manager_id')
      .eq('teacher_id', userId);
    for (const m of myManagers ?? []) {
      ids.add(m.manager_id);
      const { data: siblings } = await svc
        .from('manager_teacher_assignments')
        .select('teacher_id')
        .eq('manager_id', m.manager_id);
      for (const sib of siblings ?? []) ids.add(sib.teacher_id);
    }
  }

  return ids;
}

