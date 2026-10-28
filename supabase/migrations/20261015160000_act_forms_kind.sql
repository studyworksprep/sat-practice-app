-- =========================================================
-- act_forms.kind: released exam vs online practice test (2026-10-15)
-- =========================================================
-- Three groups of ACT forms exist in the bank:
--   classic              format = 'classic'. The pre-2025 test carried
--                        its field-test items in a separate fifth
--                        section, so a form has the full 75/60/40/40.
--   online practice test format = 'enhanced', kind = 'practice'. New
--                        format; may include the unscored items (up to
--                        English 50 / Math 45 / Reading 36 / Science 40).
--   released exam        format = 'enhanced', kind = 'released'. New
--                        format with the unscored items omitted, so a
--                        complete form has 40 / 41 / 27 / 34.
-- Timing is unchanged by the kind: a section is timed at the official
-- pace for its question count (lib/practice/act-test-plan.ts), so 40
-- released English questions get 28 minutes and 50 get 35. The kind
-- drives completeness checks on /admin/act/forms and the label a
-- student sees on the ACT tests hub.

alter table public.act_forms
  add column if not exists kind text not null default 'released'
    check (kind in ('released', 'practice'));

comment on column public.act_forms.kind is
  'released = released exam (unscored items omitted; complete enhanced form = 40/41/27/34); practice = online practice test in the new format (may include unscored items, up to 50/45/36/40). Timing is pace-based either way.';

-- Backfill: an enhanced form with more questions in any section than a
-- released exam can carry must include unscored items.
update public.act_forms f
set kind = 'practice'
where f.format = 'enhanced'
  and exists (
    select 1
    from public.act_questions q
    where q.source_test = f.source_test
      and q.deleted_at is null
    group by q.section
    having (q.section = 'english' and count(*) > 40)
        or (q.section = 'math'    and count(*) > 41)
        or (q.section = 'reading' and count(*) > 27)
        or (q.section = 'science' and count(*) > 34)
  );
