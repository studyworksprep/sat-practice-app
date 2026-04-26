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

const TUTOR_ROLES = new Set(['teacher', 'manager', 'admin']);

/**
 * @param {object} args
 * @param {string} args.questionId
 * @param {string} args.role - caller's profile.role
 * @param {string} args.userId - caller's profile.id
 * @returns {Promise<{
 *   notes: Array<object>,
 *   isAdmin: boolean,
 *   currentUserId: string,
 *   canView: boolean,
 * }>}
 */
export async function loadQuestionNotes({ questionId, role, userId }) {
  if (!TUTOR_ROLES.has(role) || !questionId || !userId) {
    return { notes: [], isAdmin: false, currentUserId: userId, canView: false };
  }

  const visibleAuthorIds = await getVisibleAuthorIds({ role, userId });

  // Service-client read so we can resolve every author profile
  // — manager / teacher row visibility through the calling user's
  // RLS-scoped client would drop notes from authors they can't
  // see directly.
  const svc = createServiceClient();
  const { data: rawNotes } = await svc
    .from('question_notes')
    .select(
      'id, question_id, author_id, content, created_at, updated_at, ' +
      'profiles:author_id(first_name, last_name, email, role)',
    )
    .eq('question_id', questionId)
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
 */
export async function loadQuestionNotesByQuestion({ questionIds, role, userId }) {
  const empty = { notesByQid: new Map(), isAdmin: false, currentUserId: userId, canView: false };
  if (!TUTOR_ROLES.has(role) || !userId) return empty;
  const ids = (questionIds ?? []).filter(Boolean);
  if (ids.length === 0) return { ...empty, canView: true, isAdmin: role === 'admin' };

  const visibleAuthorIds = await getVisibleAuthorIds({ role, userId });

  const svc = createServiceClient();
  const { data: rawNotes } = await svc
    .from('question_notes')
    .select(
      'id, question_id, author_id, content, created_at, updated_at, ' +
      'profiles:author_id(first_name, last_name, email, role)',
    )
    .in('question_id', ids)
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

  const svc = createServiceClient();
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

