-- Reading Coach RLS persona verification.
-- PR 1 checklist item from docs/reading-coach-implementation-plan.md:
-- "Run advisors and verify policies with multiple personas."
--
-- Run the WHOLE file as ONE statement batch against studyworks-dev
-- (Supabase MCP execute_sql, or psql -f). It is fully transactional:
-- every mutation rolls back at the end, and the final SELECT reports
-- each check as pass/fail. Expected: every row has pass = true.
--
-- Personas are resolved from the seeded fixtures (an admin, a teacher
-- with roster assignments, one assigned student, one unassigned
-- student). Role switching uses set_config('role', ...) +
-- set_config('request.jwt.claims', ...), which is how PostgREST
-- itself impersonates callers.
--
-- IMPORTANT: the app's RLS helpers (is_admin / is_teacher / is_demo)
-- read `auth.jwt() -> 'app_metadata'`, NOT profiles.role — so every
-- simulated claim set must carry an app_metadata object mirroring
-- what the real auth hook stamps into tokens. A claim set without it
-- silently demotes the persona to a plain student.

begin;

create temp table rc_checks(
  ts timestamptz default clock_timestamp(),
  name text,
  pass boolean,
  note text
);
grant select, insert on rc_checks to authenticated;

-- Persona switcher. Claims mirror what the auth hook stamps into real
-- tokens: sub + app_metadata.{role, is_demo}. Temp function so it
-- vanishes with the session.
create function pg_temp.become(p_sub uuid, p_role text, p_demo boolean default false)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_sub,
    'role', 'authenticated',
    'app_metadata', json_build_object('role', p_role, 'is_demo', p_demo)
  )::text, true);
  perform set_config('role', 'authenticated', true);
end;
$fn$;

do $$
declare
  v_admin uuid;
  v_teacher uuid;
  v_s1 uuid;  -- student assigned to v_teacher
  v_s2 uuid;  -- student with no roster assignment
  v_item uuid;
  v_ver uuid;
  v_draft_item uuid;
  v_draft_ver uuid;
  v_s1_session uuid;
  v_s2_session uuid;
  n int;
begin
  select id into strict v_admin from public.profiles where role = 'admin' limit 1;
  select id into strict v_teacher from public.profiles where role = 'teacher' limit 1;
  select p.id into strict v_s1 from public.profiles p
    where p.role = 'student'
      and exists (select 1 from public.teacher_student_assignments t
                  where t.student_id = p.id and t.teacher_id = v_teacher)
    order by p.id limit 1;
  select p.id into strict v_s2 from public.profiles p
    where p.role = 'student'
      and not exists (select 1 from public.teacher_student_assignments t
                      where t.student_id = p.id)
    order by p.id limit 1;

  -- ══ admin persona: author + publish one item, leave one draft ══
  perform pg_temp.become(v_admin, 'admin');

  begin
    insert into public.reading_coach_items (slug, title, genre, difficulty, source_metadata, created_by)
      values ('rls-check-published', 'RLS check (published)', 'science', 1,
              '{"rightsStatus": "owned"}', v_admin)
      returning id into v_item;
    insert into public.reading_coach_item_versions
        (item_id, version_number, question_stem_html, passage_html,
         task_type, processing_mode, rubric, created_by)
      values (v_item, 1, '<p>stem</p>', '<p>passage</p>',
              'main_idea', 'adaptive', '{}', v_admin)
      returning id into v_ver;
    insert into public.reading_coach_choices
        (item_version_id, label, sort_order, choice_html, is_correct, rationale_html)
      values (v_ver, 'A', 1, '<p>a</p>', true,  '<p>r</p>'),
             (v_ver, 'B', 2, '<p>b</p>', false, '<p>r</p>'),
             (v_ver, 'C', 3, '<p>c</p>', false, '<p>r</p>'),
             (v_ver, 'D', 4, '<p>d</p>', false, '<p>r</p>');
    update public.reading_coach_item_versions set published_at = now() where id = v_ver;
    update public.reading_coach_items
      set status = 'published', current_version_id = v_ver where id = v_item;

    insert into public.reading_coach_items (slug, title, genre, difficulty, created_by)
      values ('rls-check-draft', 'RLS check (draft)', 'history', 2, v_admin)
      returning id into v_draft_item;
    insert into public.reading_coach_item_versions
        (item_id, version_number, question_stem_html, passage_html,
         task_type, processing_mode, rubric, created_by)
      values (v_draft_item, 1, '<p>s</p>', '<p>p</p>',
              'detail', 'whole_passage', '{}', v_admin)
      returning id into v_draft_ver;
    insert into rc_checks(name, pass) values ('admin can author + publish content', true);
  exception when others then
    insert into rc_checks(name, pass, note)
      values ('admin can author + publish content', false, sqlerrm);
  end;

  -- ══ student 1 (assigned): content visibility + own session/turns ══
  perform pg_temp.become(v_s1, 'student');

  select count(*) into n from public.reading_coach_items;
  insert into rc_checks(name, pass, note)
    values ('student sees only published items', n = 1, 'saw ' || n);
  select count(*) into n from public.reading_coach_item_versions;
  insert into rc_checks(name, pass, note)
    values ('student sees only published versions', n = 1, 'saw ' || n);
  select count(*) into n from public.reading_coach_choices;
  insert into rc_checks(name, pass, note)
    values ('student sees choices of published version only', n = 4, 'saw ' || n);

  begin
    update public.reading_coach_items set title = 'defaced' where id = v_item;
    get diagnostics n = row_count;
    insert into rc_checks(name, pass, note)
      values ('student cannot update content', n = 0, n || ' rows updated');
  exception when others then
    insert into rc_checks(name, pass, note)
      values ('student cannot update content', true, 'rejected: ' || sqlerrm);
  end;

  begin
    insert into public.reading_coach_items (slug, title, genre, difficulty, created_by)
      values ('student-item', 'nope', 'science', 1, v_s1);
    insert into rc_checks(name, pass, note)
      values ('student cannot insert content', false, 'insert succeeded');
  exception when others then
    insert into rc_checks(name, pass) values ('student cannot insert content', true);
  end;

  begin
    insert into public.reading_coach_sessions (user_id, item_version_id)
      values (v_s1, v_ver) returning id into v_s1_session;
    insert into rc_checks(name, pass) values ('student can start own session', true);
  exception when others then
    insert into rc_checks(name, pass, note)
      values ('student can start own session', false, sqlerrm);
  end;

  begin
    insert into public.reading_coach_sessions (user_id, item_version_id)
      values (v_s2, v_ver);
    insert into rc_checks(name, pass, note)
      values ('student cannot start session as another user', false, 'insert succeeded');
  exception when others then
    insert into rc_checks(name, pass)
      values ('student cannot start session as another user', true);
  end;

  begin
    insert into public.reading_coach_turns
        (session_id, user_id, client_request_id, stage, attempt_number, student_text)
      values (v_s1_session, v_s1, gen_random_uuid(), 'task', 1, 'find the main point');
    insert into rc_checks(name, pass) values ('student can record own turn', true);
  exception when others then
    insert into rc_checks(name, pass, note)
      values ('student can record own turn', false, sqlerrm);
  end;

  -- The NULLS NOT DISTINCT guarantee: same (session, stage, NULL
  -- unit_key, attempt_number) twice must violate uniqueness.
  begin
    insert into public.reading_coach_turns
        (session_id, user_id, client_request_id, stage, attempt_number, student_text)
      values (v_s1_session, v_s1, gen_random_uuid(), 'task', 1, 'duplicate');
    insert into rc_checks(name, pass, note)
      values ('duplicate attempt with NULL unit_key rejected', false, 'duplicate accepted');
  exception
    when unique_violation then
      insert into rc_checks(name, pass)
        values ('duplicate attempt with NULL unit_key rejected', true);
    when others then
      insert into rc_checks(name, pass, note)
        values ('duplicate attempt with NULL unit_key rejected', false, 'wrong error: ' || sqlerrm);
  end;

  begin
    insert into public.reading_coach_turns
        (session_id, user_id, client_request_id, stage, unit_key, attempt_number, student_text)
      values (v_s1_session, v_s1, gen_random_uuid(), 'task', 'u1', 1, 'x');
    insert into rc_checks(name, pass, note)
      values ('unit_key forbidden outside processing_unit stage', false, 'insert succeeded');
  exception
    when check_violation then
      insert into rc_checks(name, pass)
        values ('unit_key forbidden outside processing_unit stage', true);
    when others then
      insert into rc_checks(name, pass, note)
        values ('unit_key forbidden outside processing_unit stage', false, 'wrong error: ' || sqlerrm);
  end;

  select count(*) into n from public.reading_coach_turn_reviews;
  insert into rc_checks(name, pass, note)
    values ('student cannot read QA reviews', n = 0, 'saw ' || n);

  -- ══ student 2 (unassigned): isolation from student 1 ══
  perform pg_temp.become(v_s2, 'student');

  select count(*) into n from public.reading_coach_sessions;
  insert into rc_checks(name, pass, note)
    values ('student B cannot see student A sessions', n = 0, 'saw ' || n);
  select count(*) into n from public.reading_coach_turns;
  insert into rc_checks(name, pass, note)
    values ('student B cannot see student A turns', n = 0, 'saw ' || n);

  begin
    insert into public.reading_coach_turns
        (session_id, user_id, client_request_id, stage, attempt_number, student_text)
      values (v_s1_session, v_s2, gen_random_uuid(), 'task', 1, 'hijack');
    insert into rc_checks(name, pass, note)
      values ('student B cannot attach turn to student A session', false, 'insert succeeded');
  exception when others then
    insert into rc_checks(name, pass)
      values ('student B cannot attach turn to student A session', true);
  end;

  begin
    insert into public.reading_coach_sessions (user_id, item_version_id)
      values (v_s2, v_ver) returning id into v_s2_session;
    insert into rc_checks(name, pass) values ('student B can start own session', true);
  exception when others then
    insert into rc_checks(name, pass, note)
      values ('student B can start own session', false, sqlerrm);
  end;

  -- ══ teacher: can_view boundary ══
  perform pg_temp.become(v_teacher, 'teacher');

  select count(*) into n from public.reading_coach_sessions where user_id = v_s1;
  insert into rc_checks(name, pass, note)
    values ('assigned tutor sees assigned student sessions', n = 1, 'saw ' || n);
  select count(*) into n from public.reading_coach_turns where user_id = v_s1;
  insert into rc_checks(name, pass, note)
    values ('assigned tutor sees assigned student turns', n = 1, 'saw ' || n);
  select count(*) into n from public.reading_coach_sessions where user_id = v_s2;
  insert into rc_checks(name, pass, note)
    values ('tutor cannot see unassigned student sessions', n = 0, 'saw ' || n);

  begin
    insert into public.reading_coach_sessions (user_id, item_version_id)
      values (v_s1, v_ver);
    insert into rc_checks(name, pass, note)
      values ('tutor cannot create session for student', false, 'insert succeeded');
  exception when others then
    insert into rc_checks(name, pass)
      values ('tutor cannot create session for student', true);
  end;

  -- ══ admin: full visibility via can_view ══
  perform pg_temp.become(v_admin, 'admin');

  select count(*) into n from public.reading_coach_sessions;
  insert into rc_checks(name, pass, note)
    values ('admin sees all sessions', n = 2, 'saw ' || n);

  -- ══ demo account: writes blocked by restrictive policies ══
  -- is_demo() reads app_metadata.is_demo from the JWT, so the demo
  -- persona is purely a claims change — no profiles mutation needed.
  perform pg_temp.become(v_s2, 'student', true);

  begin
    insert into public.reading_coach_sessions (user_id, item_version_id)
      values (v_s2, v_ver);
    insert into rc_checks(name, pass, note)
      values ('demo account cannot create sessions', false, 'insert succeeded');
  exception when others then
    insert into rc_checks(name, pass) values ('demo account cannot create sessions', true);
  end;

  perform set_config('role', 'none', true);
end;
$$;

select name, pass, note from rc_checks order by ts;

rollback;
