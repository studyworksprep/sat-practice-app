-- Merge one concept tag into another, atomically.
--
-- The admin concept-tag manager (/admin/concept-tags) needs merge for
-- when two tags were accidentally created for the same concept (e.g.
-- "Comma splice" vs "comma splices"). A merge is three steps that must
-- not be torn apart by a mid-flight failure — repoint links, skip
-- duplicates, delete the losing tag — so it runs as one SECURITY
-- DEFINER function instead of three PostgREST calls. SECURITY DEFINER
-- also sidesteps the deliberately absent UPDATE policy on
-- question_concept_tags (RLS there is select/insert/delete only); the
-- function gates on is_admin() itself, matching the admin-only
-- update/delete policies on concept_tags.

create or replace function public.merge_concept_tags(
  p_source_tag_id uuid,
  p_target_tag_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source concept_tags%rowtype;
  v_target concept_tags%rowtype;
  v_source_links integer;
  v_moved integer;
begin
  if not is_admin() then
    raise exception 'Admin only';
  end if;
  if p_source_tag_id is null or p_target_tag_id is null then
    raise exception 'Both tag ids are required';
  end if;
  if p_source_tag_id = p_target_tag_id then
    raise exception 'Cannot merge a tag into itself';
  end if;

  -- Lock both tag rows so two concurrent merges over the same tags
  -- serialize instead of interleaving.
  select * into v_source from concept_tags where id = p_source_tag_id for update;
  if not found then
    raise exception 'Source tag not found';
  end if;
  select * into v_target from concept_tags where id = p_target_tag_id for update;
  if not found then
    raise exception 'Target tag not found';
  end if;

  select count(*) into v_source_links
  from question_concept_tags
  where tag_id = p_source_tag_id;

  -- Copy links over, keeping original created_at/created_by.
  -- Questions already carrying the target tag are skipped via the
  -- (question_id, tag_id) unique key.
  insert into question_concept_tags (question_id, tag_id, created_at, created_by)
  select question_id, p_target_tag_id, created_at, created_by
  from question_concept_tags
  where tag_id = p_source_tag_id
  on conflict (question_id, tag_id) do nothing;
  get diagnostics v_moved = row_count;

  -- Deleting the source tag cascades away its remaining links
  -- (question_concept_tags_tag_id_fkey is ON DELETE CASCADE).
  delete from concept_tags where id = p_source_tag_id;

  return jsonb_build_object(
    'moved', v_moved,
    'skipped_duplicates', v_source_links - v_moved,
    'source_name', v_source.name,
    'target_name', v_target.name
  );
end;
$$;

comment on function public.merge_concept_tags(uuid, uuid) is
  'Repoints all question links from the source tag to the target tag '
  '(skipping questions that already carry the target), then deletes the '
  'source tag. Admin-only (raises otherwise); returns {moved, '
  'skipped_duplicates, source_name, target_name}.';

revoke execute on function public.merge_concept_tags(uuid, uuid) from public;
revoke execute on function public.merge_concept_tags(uuid, uuid) from anon;
grant execute on function public.merge_concept_tags(uuid, uuid) to authenticated;
