-- Add sat_test_date column to profiles for upcoming registered SAT date
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sat_test_date timestamptz;
