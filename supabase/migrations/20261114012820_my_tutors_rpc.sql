-- The student's own tutors, for Account → "Your teachers".
--
-- profiles RLS is can_view(id), and can_view has no student → tutor
-- path, so the account page's nested join from
-- teacher_student_assignments to the tutor's profile always came back
-- null and every student saw "You haven't linked a teacher yet" — even
-- right after linking. Rather than open the whole tutor profile row to
-- students, this returns only the fields the page shows, for the
-- caller's own links.
create or replace function public.my_tutors()
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  is_studyworks boolean,
  sponsored boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.first_name, p.last_name, p.email,
         coalesce(p.subscription_exempt, false) as is_studyworks,
         (t.sponsored and coalesce(p.subscription_exempt, false)) as sponsored
    from public.teacher_student_assignments t
    join public.profiles p on p.id = t.teacher_id
   where t.student_id = auth.uid()
   order by t.created_at nulls last, p.last_name, p.first_name;
$$;

comment on function public.my_tutors() is
  'The caller''s tutors (name, email, Studyworks flag, whether this link is sponsored) for the Account page. Students cannot read tutor profiles directly.';

revoke execute on function public.my_tutors() from public, anon;
grant execute on function public.my_tutors() to authenticated;
