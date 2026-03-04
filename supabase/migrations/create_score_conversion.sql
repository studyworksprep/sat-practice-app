-- Create score_conversion lookup table
-- Maps (test, section, module1_correct, module2_correct) → scaled_score
-- Both module scores are needed because adaptive routing affects scoring:
-- e.g. 19 right in M1 + 4 right in M2 scores differently than 4 right in M1 + 19 right in M2
-- Run this in the Supabase SQL editor or via the Supabase CLI.

create table if not exists score_conversion (
  id              uuid primary key default gen_random_uuid(),
  test_id         text    not null,
  test_name       text    not null,
  section         text    not null check (section in ('reading_writing', 'math')),
  module1_correct integer not null check (module1_correct >= 0),
  module2_correct integer not null check (module2_correct >= 0),
  scaled_score    integer not null check (scaled_score between 200 and 800),

  constraint score_conversion_unique
    unique (test_id, section, module1_correct, module2_correct)
);

-- Index for fast lookups by test + section + both module scores
create index if not exists idx_score_conversion_lookup
  on score_conversion (test_id, section, module1_correct, module2_correct);
