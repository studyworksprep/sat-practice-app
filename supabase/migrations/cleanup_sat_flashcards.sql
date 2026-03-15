-- Remove all "Common SAT Words" flashcards and flashcard_sets created under the old design.
-- This deletes the per-user copies of SAT vocabulary cards.
-- User-created cards in "My Math", "My Reading", and custom sets are NOT affected.

-- Step 1: Delete flashcards belonging to any "Common SAT Words" sub-sets
delete from public.flashcards
where set_id in (
  select id from public.flashcard_sets
  where parent_set_id in (
    select id from public.flashcard_sets
    where name = 'Common SAT Words' and parent_set_id is null
  )
);

-- Step 2: Delete the sub-sets themselves
delete from public.flashcard_sets
where parent_set_id in (
  select id from public.flashcard_sets
  where name = 'Common SAT Words' and parent_set_id is null
);

-- Step 3: Delete the "Common SAT Words" parent sets
delete from public.flashcard_sets
where name = 'Common SAT Words' and parent_set_id is null;
