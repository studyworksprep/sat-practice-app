-- Earlier migrations made profiles.ui_version the canonical source
-- and added a trigger that mirrors it into auth.users.app_metadata.
-- The migrateUserToNext server action did the reverse — wrote
-- straight to app_metadata via the admin client — so profiles
-- never got updated and the admin User Management page (which
-- reads profiles.ui_version) showed migrated students as legacy.
-- The action has been changed to write profiles.ui_version (which
-- the trigger then mirrors), but historical drift needs cleanup.

update public.profiles p
set    ui_version = 'next'
from   auth.users u
where  u.id = p.id
  and  (u.raw_app_meta_data->>'ui_version') = 'next'
  and  p.ui_version is distinct from 'next';
