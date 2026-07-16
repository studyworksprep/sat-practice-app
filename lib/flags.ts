// Feature-flag stage resolution — the pure half of the flag system.
// Server IO (the actual feature_flags read) lives in
// lib/flags-server.ts; this module stays import-free so `node --test`
// can exercise the rollout policy directly (see lib/flags.test.mjs).
//
// The `sidebar_shell` flag drives the Phase 6.1 staged rollout of the
// sidebar layout (docs/upgrade-plan-2026-07.md §6.1). Stages:
//
//   'off'   — every role gets the legacy top AppNav (also the behavior
//             when the flag row is missing or unreadable: fail closed
//             to the chrome that predates the flag).
//   'staff' — teacher / manager / admin get the sidebar; students keep
//             the top nav. "Tutors first" per the rollout standard.
//   'all'   — everyone gets the sidebar.

export type SidebarStage = 'off' | 'staff' | 'all';

const STAFF_ROLES = ['teacher', 'manager', 'admin'];

/** Interpret a raw feature_flags.value for the sidebar_shell flag.
 *  Unknown values are treated as 'off' so a typo'd flag row can never
 *  flip chrome for everyone. */
export function resolveSidebarStage(
  value: string | null | undefined,
  role: string | null | undefined,
): boolean {
  if (value === 'all') return true;
  if (value === 'staff') return STAFF_ROLES.includes(role ?? '');
  return false;
}
