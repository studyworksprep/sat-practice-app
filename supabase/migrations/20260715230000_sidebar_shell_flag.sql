-- =========================================================
-- sidebar_shell feature flag — Phase 6.1 staged rollout (OFF)
-- =========================================================
-- The route-group layouts read this flag (lib/flags-server.ts) to
-- decide between the legacy top AppNav and the new AppShell sidebar.
-- Stages, resolved by lib/flags.ts resolveSidebarStage():
--
--   'off'   — everyone keeps the top AppNav (default; also the
--             behavior if this row is missing or unreadable).
--   'staff' — teacher / manager / admin get the sidebar; students
--             keep the top nav ("tutors first" per the rollout
--             standard in docs/upgrade-plan-2026-07.md).
--   'all'   — everyone gets the sidebar.
--
-- Data-only migration: no schema change, no type regeneration.

insert into public.feature_flags (key, value, description)
values ('sidebar_shell', 'off',
  'Phase 6.1 sidebar shell rollout: off | staff (teacher/manager/admin see the AppShell sidebar) | all. Layouts fall back to the legacy top AppNav when off/missing. See lib/flags.ts + lib/ui/AppSidebar.tsx.')
on conflict (key) do nothing;
