-- Grants parity: ensure the authenticated role has CRUD on all
-- public tables, matching what production has out-of-band.
--
-- Supabase's default template grants these on project creation, but
-- our migration-replay dev DB never had them because migrations
-- didn't include them. Without these grants, PostgREST returns
-- "permission denied" before RLS even fires — the authenticated
-- role can't reach the table at all.
--
-- This migration also sets ALTER DEFAULT PRIVILEGES so any table
-- created by future migrations automatically inherits the same
-- grants. No more per-table GRANT boilerplate needed.

-- Existing tables.
grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant usage
  on all sequences in schema public
  to authenticated;

-- Future tables created by the postgres role (which owns migrations).
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage on sequences to authenticated;
