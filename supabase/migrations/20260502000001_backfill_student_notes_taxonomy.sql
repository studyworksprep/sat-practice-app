-- Backfill subject / domain / skill on existing student_notes rows
-- by copying from the linked questions_v2 row. Only touches rows
-- that haven't been classified yet (every taxonomy column NULL),
-- so a row a student has already manually categorized via the
-- editor's Subject / Domain / Skill inputs is left alone.
--
-- subject_code is derived from domain_code the same way
-- domainSection() does in lib/ui/question-layout.js: the four
-- reading-domain codes map to 'rw'; everything else maps to 'math'.

update public.student_notes sn
set
  subject_code = case
    when q.domain_code in ('CAS', 'EOI', 'INI', 'SEC') then 'rw'
    when q.domain_code is null then null
    else 'math'
  end,
  domain_code  = q.domain_code,
  domain_name  = q.domain_name,
  skill_code   = q.skill_code,
  skill_name   = q.skill_name
from public.questions_v2 q
where sn.question_id = q.id
  and sn.subject_code is null
  and sn.domain_code  is null
  and sn.domain_name  is null
  and sn.skill_code   is null
  and sn.skill_name   is null;
