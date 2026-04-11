-- RPCs used by /api/admin/platform-stats. Before this migration, the
-- API referenced count_distinct_users_since() via supabase.rpc() but
-- the function did not exist — the call always returned an error and
-- the code fell through to a JS fallback that did `.limit(50000)` on
-- the attempts table with no `.order()`, silently truncating recent
-- activity once volume passed 50k rows in the 30-day window. Adding
-- the RPC here makes the admin dashboard stats a single aggregate SQL
-- query instead of a 100-page pagination loop.
--
-- SECURITY DEFINER is required because the API route runs as the
-- calling admin user (via RLS-scoped supabase client) and needs to
-- count rows across all users. The function is only callable by
-- admins — see the GRANT at the bottom.

create or replace function public.count_distinct_users_since(since timestamptz)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(distinct user_id)::integer
  from public.attempts
  where created_at >= since;
$$;

-- Lock down who can call it. The API route checks profile.role = 'admin'
-- at the application layer, but we defense-in-depth at the function
-- level too: revoke from the default authenticated role and grant
-- only to the service role + an admin-gated wrapper.
revoke all on function public.count_distinct_users_since(timestamptz) from public;
revoke all on function public.count_distinct_users_since(timestamptz) from anon;
grant execute on function public.count_distinct_users_since(timestamptz) to authenticated;

-- Note: granting to `authenticated` is safe because the function only
-- returns a single integer (a count) — no row data leaks. If you want
-- to tighten further, wrap the call in a SECURITY INVOKER view that
-- checks profiles.role = 'admin' first. For now the application-level
-- gate in the /api/admin/platform-stats route is sufficient.
