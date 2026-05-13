-- Move LessonWorks parent billing emails out of profiles.email and
-- into profiles.parent_email for any profile that was provisioned
-- via POST /api/public/students/provision *before* the route was
-- updated to write to parent_email. Detection rule:
--
--   auth.users.email = the provision synth (lw-<uuid>@provisioned
--                                          .studyworks.local)
--   AND profiles.email != that synth
--
-- — meaning the create-path of provision overwrote the synth-mirror
-- with the parent email. Move it to parent_email and restore
-- profiles.email to the synth so it agrees with auth.users.email.
--
-- Idempotent: re-running after the route is fixed finds no rows to
-- update because profiles.email and auth.users.email agree on all
-- new provisioned rows going forward.

update public.profiles p
   set parent_email = p.email,
       email        = u.email
  from auth.users u
 where u.id = p.id
   and u.email like 'lw-%@provisioned.studyworks.local'
   and p.email is distinct from u.email;
