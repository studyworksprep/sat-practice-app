-- Post-deploy hardening for the lesson revision workflow.
--
-- Each RPC can operate under the caller's RLS permissions, so SECURITY
-- INVOKER is sufficient and keeps the functions from acquiring owner rights.
alter function public.create_lesson_revision(uuid, text) security invoker;
alter function public.publish_lesson_revision(uuid, boolean) security invoker;
alter function public.can_view_lesson_revision(uuid) security invoker;
alter function public.can_edit_lesson_revision(uuid) security invoker;

-- Cache request-scoped auth/helper calls once per statement, and combine the
-- contributor/admin UPDATE paths into one permissive policy.
drop policy if exists lesson_revisions_select on public.lesson_revisions;
create policy lesson_revisions_select on public.lesson_revisions
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (select public.is_admin())
  );

drop policy if exists lesson_revisions_insert on public.lesson_revisions;
create policy lesson_revisions_insert on public.lesson_revisions
  for insert to authenticated
  with check (
    (select public.is_teacher()) and not (select public.is_demo())
    and owner_id = (select auth.uid()) and state = 'draft'
  );

drop policy if exists lesson_revisions_owner_update on public.lesson_revisions;
drop policy if exists lesson_revisions_admin_update on public.lesson_revisions;
create policy lesson_revisions_update on public.lesson_revisions
  for update to authenticated
  using (
    (select public.is_admin())
    or (
      owner_id = (select auth.uid())
      and state in ('draft', 'changes_requested')
      and (select public.is_teacher())
      and not (select public.is_demo())
    )
  )
  with check (
    (select public.is_admin())
    or (
      owner_id = (select auth.uid())
      and state in ('draft', 'changes_requested', 'submitted')
      and (select public.is_teacher())
      and not (select public.is_demo())
    )
  );

drop policy if exists lesson_revisions_delete on public.lesson_revisions;
create policy lesson_revisions_delete on public.lesson_revisions
  for delete to authenticated
  using (
    (select public.is_admin())
    or (
      owner_id = (select auth.uid())
      and state in ('draft', 'changes_requested')
    )
  );

-- Cover foreign keys that may be traversed or checked during parent deletes.
create index lesson_revisions_base_lesson_idx
  on public.lesson_revisions(base_lesson_id);
create index lesson_revisions_published_lesson_idx
  on public.lesson_revisions(published_lesson_id);
create index lesson_revisions_reviewer_idx
  on public.lesson_revisions(reviewer_id);
create index lesson_revision_topics_pattern_idx
  on public.lesson_revision_topics(pattern_id);
create index lesson_publication_history_revision_idx
  on public.lesson_publication_history(revision_id);
create index lesson_publication_history_created_by_idx
  on public.lesson_publication_history(created_by);
