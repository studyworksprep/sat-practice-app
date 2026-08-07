// Per-student switch for dynamic detours (§3.2) — the "Tough
// stretch. Want to step back?" offer the runner makes after two
// consecutive misses.
//
// `profiles.practice_detours_enabled` is tri-state:
//
//   true  → the runner probes and offers as it does today
//   false → no probe, no offer; the set is walked as it was built
//   null  → nobody has chosen yet; the default is derived here —
//           OFF for a student with an assigned tutor, ON for a
//           self-guided student.
//
// Deriving the default rather than backfilling one keeps students
// who sign up later, or link a tutor later, on the right side of
// the line without a second data migration. The first explicit
// toggle (by the tutor or the student) writes a real boolean and
// the derived default stops applying to them.
//
// Consumers: the practice runner page (which passes the resolved
// boolean into PracticeInteractive), loadDetourSession in
// session-actions.ts (the server-side gate, so the setting can't
// be bypassed by calling the action directly), the Account page,
// and the tutor's student-detail page.

/**
 * Resolve the effective setting from the stored preference.
 *
 * @param {{ preference?: boolean|null, hasAssignedTutor?: boolean }} input
 * @returns {boolean} true when detours should be offered
 */
export function resolveDetoursEnabled({
  preference = null,
  hasAssignedTutor = false,
} = {}) {
  if (typeof preference === 'boolean') return preference;
  return !hasAssignedTutor;
}

/**
 * Read the preference for one student.
 *
 * Runs on whatever client the caller passes: the student reads
 * their own row under RLS, a tutor reads their student's row under
 * can_view(). Both reads failing is non-fatal — we fall back to
 * detours on, which is how the runner behaved before the toggle
 * existed.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} studentId
 * @returns {Promise<{ enabled: boolean, preference: boolean|null, hasAssignedTutor: boolean }>}
 */
export async function loadDetourPreference(supabase, studentId) {
  const [profileResult, tutorResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('practice_detours_enabled')
      .eq('id', studentId)
      .maybeSingle(),
    supabase
      .from('teacher_student_assignments')
      .select('teacher_id')
      .eq('student_id', studentId)
      .limit(1),
  ]);

  const preference = profileResult.data?.practice_detours_enabled ?? null;
  const hasAssignedTutor = (tutorResult.data ?? []).length > 0;

  return {
    preference,
    hasAssignedTutor,
    enabled: resolveDetoursEnabled({ preference, hasAssignedTutor }),
  };
}

/**
 * What each toggle surface says about the switch. Same setting, two
 * audiences: the tutor reads about their student, the student reads
 * about themselves. Kept together so the two surfaces can't drift
 * into describing the same behavior differently.
 */
export const DETOUR_COPY = {
  label: 'Step-back offers',
  tutor: {
    on: 'After two misses in a row, this student is offered an easier question on the same skill, or the skill’s lesson.',
    off: 'This student works straight through a question set as you built it — no easier-question offers.',
  },
  student: {
    on: 'After you miss two in a row, you can choose an easier question on the same skill, or go review the lesson.',
    off: 'You work straight through a practice set from start to finish — no step-back offers.',
  },
};
