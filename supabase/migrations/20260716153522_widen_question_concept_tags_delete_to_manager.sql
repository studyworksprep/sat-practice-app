-- Widen the per-question tag-removal RLS policy from admin-only to
-- manager+admin (is_manager() covers both roles).
--
-- Managers can already add tags to a question — the insert policy
-- on question_concept_tags uses is_manager() — but removal was
-- admin-only, so the × button in the question renderer's tag strip
-- never rendered for managers. This brings the delete policy in
-- line with insert so managers can remove a tag from a question.
--
-- Scope: this is the question↔tag link table only. Catalog-wide
-- deletion of the tag itself (concept_tags_delete) stays admin-only.
--
-- Paired app change: removeConceptTagFromQuestion in
-- lib/practice/concept-tags-actions.ts widened requireRole(['admin'])
-- to ['manager', 'admin'], and the per-surface conceptTagsCanDelete
-- flags now match conceptTagsCanTag.

drop policy "question_concept_tags_delete" on public.question_concept_tags;
create policy "question_concept_tags_delete" on public.question_concept_tags
  for delete to public using (is_manager());
