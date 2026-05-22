-- New signups must default to the new UI tree.
--
-- profiles.ui_version was created with `default 'legacy'` when the
-- parallel-build rollout started (20240101000002) — the next tree
-- didn't exist yet, so every new account correctly began on legacy.
--
-- That has since inverted: proxy.js now treats the next tree as the
-- default for every visitor and only an explicit ui_version='legacy'
-- parks a user on the old tree. But the column default was never
-- updated, and handle_new_user inserts profiles without naming
-- ui_version — so the column default still stamped every new signup
-- 'legacy'. That quietly minted a fresh legacy user on every signup
-- and made the Phase 6 precondition ("100% of users on next")
-- impossible to ever reach.
--
-- Flip the column default to 'next'. handle_new_user needs no change
-- — it omits the column, so the new default applies. The
-- sync_role_to_auth_metadata trigger then mirrors 'next' into
-- auth.users app_metadata, so the JWT carries it from the first
-- token issued. Existing profile rows are untouched: this changes
-- only the default for future inserts, not any current value.
--
-- Applied out-of-band to production (project noqtadytxyslkoetchrs)
-- on 2026-05-21 via the Supabase MCP, per docs/runbook.md "Applying
-- a hotfix migration". At apply time all 66 prod users were already
-- on 'next'; this stops the next signup from regressing to legacy.
-- Replays normally on dev via `supabase db reset`.

alter table public.profiles
  alter column ui_version set default 'next';

comment on column public.profiles.ui_version is
  'Which UI tree this user sees. legacy -> app/*, next -> app/next/*. Defaults to next for new signups; only an explicit ''legacy'' value parks a user on the old tree. Removed in Phase 6 when the legacy tree is decommissioned.';

-- Nudge PostgREST to reload so the changed default is reflected.
notify pgrst, 'reload schema';
