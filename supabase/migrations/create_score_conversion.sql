-- Create score_conversion lookup table
-- Maps (test, section, raw_score) → scaled_score
-- raw_score = total correct across both modules for that section
-- Run this in the Supabase SQL editor or via the Supabase CLI.

create table if not exists score_conversion (
  id         uuid primary key default gen_random_uuid(),
  test_id    text    not null,
  test_name  text    not null,
  section    text    not null check (section in ('reading_writing', 'math')),
  raw_score  integer not null check (raw_score >= 0),
  scaled_score integer not null check (scaled_score between 200 and 800),

  constraint score_conversion_unique
    unique (test_id, section, raw_score)
);

-- Index for fast lookups by test + section
create index if not exists idx_score_conversion_lookup
  on score_conversion (test_id, section, raw_score);
