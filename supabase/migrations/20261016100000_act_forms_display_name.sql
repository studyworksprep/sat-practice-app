-- =========================================================
-- act_forms.display_name: a readable name per ACT form (2026-10-16)
-- =========================================================
-- act_questions.source_test is an import key ("ACT-2026-April-FormJ01",
-- "ACT-25MC1") and stays the stable identifier everywhere. Students
-- and tutors see a name instead: display_name when an admin has set
-- one on /admin/act/forms, otherwise a default derived from the key by
-- lib/practice/act-form-names.ts ("April 2026 ACT", "Online Multiple
-- Choice Test 1 (2025)"). Null means "use the derived default".

alter table public.act_forms
  add column if not exists display_name text
    check (display_name is null or (char_length(display_name) between 1 and 80));

comment on column public.act_forms.display_name is
  'Student-facing name for the form; null = derive from source_test (lib/practice/act-form-names.ts). The key in source_test never changes.';
