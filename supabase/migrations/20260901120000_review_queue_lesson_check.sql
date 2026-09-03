-- review_queue: a 'lesson_check' item type for delayed retrieval
-- (lesson-improvement plan 5.3)
--
-- On lesson completion the student is enqueued for a retrieval pass
-- ~2 days later, so a finished lesson comes back once instead of
-- being read and dropped.
--
-- Why this needs its own item_type rather than reusing 'skill' (the
-- plan's "simpler" option): syncDecayedSkillReviews reconciles skill
-- items against get_student_coverage and DELETES every skill row
-- whose unit is no longer 'decayed'. A lesson-originated skill row
-- would be swept on the next sync — usually before it ever came
-- due, since a just-taught skill is the least likely to read as
-- decayed. A distinct type is invisible to that reconciliation.
--
-- item_ref holds a lessons uuid. Resolution to questions happens in
-- the app layer (lib/review/queue.ts): a due lesson_check becomes a
-- micro-drill over the lesson's skill_code via lesson_topics, using
-- the same least-recently-attempted ranking the skill leg uses.
--
-- The unique (student_id, item_type, item_ref) key means re-completing
-- a lesson does not stack duplicate rows or push an existing due date
-- outward — intake is upsert-ignore-duplicates.

alter table public.review_queue
  drop constraint if exists review_queue_item_type_check;

alter table public.review_queue
  add constraint review_queue_item_type_check
  check (item_type in ('question', 'skill', 'flashcard', 'vocab', 'lesson_check'));

comment on table public.review_queue is
  'Per-student spaced-repetition queue (§3.1). SM-2-lite scheduling '
  'state per item; item_ref meaning depends on item_type (question '
  'uuid / skill_code / flashcard uuid / vocab id / lesson uuid). '
  'Intake: wrong answers, decayed coverage, flashcard ratings, '
  'lesson completion. Consumed by plan review tasks and the Review hub.';
