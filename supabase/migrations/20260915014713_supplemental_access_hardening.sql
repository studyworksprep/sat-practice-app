-- Anonymous callers must not discover supplemental provenance or content.
-- No anonymous permissions are added to the access-grant table.
create policy supplemental_questions_anonymous on public.questions_v2 as restrictive for select to anon using (pool='standard');
create policy supplemental_batches_anonymous on public.question_batches as restrictive for select to anon using (pool='standard');
create index question_batch_access_grantor_idx on public.question_batch_access(granted_by) where granted_by is not null;
