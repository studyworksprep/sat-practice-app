-- Allow teachers to read concept_tags and question_concept_tags
-- (they were previously restricted to manager/admin only)
drop policy if exists "concept_tags_select" on public.concept_tags;
create policy "concept_tags_select" on public.concept_tags
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('teacher', 'manager', 'admin')
    )
  );

drop policy if exists "question_concept_tags_select" on public.question_concept_tags;
create policy "question_concept_tags_select" on public.question_concept_tags
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('teacher', 'manager', 'admin')
    )
  );
