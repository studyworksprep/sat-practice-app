-- Stage D-2 of the legacy-tree decommission: drop profiles.ui_version
-- and the force_ui_version feature_flags row.
--
-- The Phase 6 decommission (Stage C) retired the legacy app/ tree;
-- Stage D-1 removed the application code that read or wrote
-- profiles.ui_version (admin bulk-migrate, per-student migrate
-- button, TreeBadge, [...slug] catch-all, the requireUser profile
-- select). At apply time all 71 production profiles are on 'next'
-- and no row would lose meaningful information by the drop.
--
-- The feature_flags TABLE stays — only the force_ui_version row goes.
-- Future kill switches may re-use the table.
--
-- The sync_role_to_auth_metadata trigger function is slimmed to stop
-- referencing ui_version (otherwise the next UPDATE on profiles
-- would error on the missing column). It continues to mirror role
-- and is_demo into auth.users.raw_app_meta_data so the JWT carries
-- those values for the proxy.js role/demo checks. Existing JWT
-- entries with a stale ui_version key are harmless — proxy.js was
-- rewritten in Stage C-3 to ignore the field — and clear on next
-- token refresh anyway.

-- 1. Update the trigger function first so it doesn't reference the
--    column we're about to drop.
create or replace function public.sync_role_to_auth_metadata()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
         'role',    new.role,
         'is_demo', new.is_demo
       )
  where id = new.id;
  return new;
end;
$$;

-- 2. Recreate the trigger without ui_version in its column list.
--    The original was `AFTER INSERT OR UPDATE OF role, ui_version,
--    is_demo`; the column-list dependency on ui_version blocks the
--    column drop below.
drop trigger if exists sync_role_trigger on public.profiles;
create trigger sync_role_trigger
  after insert or update of role, is_demo on public.profiles
  for each row execute function public.sync_role_to_auth_metadata();

-- 3. Retire the kill-switch row. The table stays for future flags.
delete from public.feature_flags where key = 'force_ui_version';

-- 4. Drop the column. No code consumes it post Stage D-1.
alter table public.profiles drop column ui_version;

-- 4. Nudge PostgREST so the dropped column is reflected in cached
--    schema introspection.
notify pgrst, 'reload schema';
