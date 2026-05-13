-- profiles.parent_email — the LessonWorks parent billing email,
-- stored as a first-class column instead of being smashed into
-- profiles.email (which is the student-identity email used for
-- auth + login).
--
-- Why this exists. The LessonWorks /provision payload carries the
-- parent billing email under `email`. We were writing it into
-- profiles.email on the create path, which collided with the
-- student-identity meaning of that column: a self-signed-up
-- Studyworks-native student has a school email there (e.g.
-- nfratangelo27@palmertrinity.org), and provisioned-from-LW
-- students were ending up with daniellyvsilveira@gmail.com sitting
-- in the "student email" slot — wrong identity, and useless for
-- candidate-matching during the search-then-claim flow because
-- LessonWorks-search?email=<parent> never hits a profiles.email
-- that's actually the student's school email.
--
-- profile.email keeps its existing meaning: the student-identity
-- email, mirrored from auth.users.email by the handle_new_user
-- trigger. parent_email is new and orthogonal — present for any
-- profile LessonWorks knows the billing-parent address for, NULL
-- for native Studyworks accounts.
--
-- Indexed via lower() for case-insensitive equality matching from
-- the search route's `email=…` param. Not unique — multiple
-- siblings legitimately share one parent address.

alter table public.profiles
  add column if not exists parent_email text;

create index if not exists idx_profiles_parent_email_lower
  on public.profiles (lower(parent_email))
  where parent_email is not null;
