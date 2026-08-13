-- Bluebook scoring-study ingestion.
--
-- Adds evidence and immutable item-level snapshots without changing the
-- legacy score_conversion lookup. A research observation is allowed to
-- disagree with another observation at the same raw counts: that is the
-- signal the item-sensitive model is intended to study.

create table public.bluebook_calibration_campaigns (
  id                    text primary key,
  name                  text not null,
  practice_test_id      uuid not null references public.practice_tests_v2(id) on delete restrict,
  is_active             boolean not null default true,
  requires_html_report  boolean not null default true,
  requires_score_image  boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.bluebook_calibration_campaigns is
  'Controlled Bluebook scoring studies. Campaign submissions remain distinct from ordinary historical contributions and train from exact response patterns.';

insert into public.bluebook_calibration_campaigns (
  id, name, practice_test_id, requires_html_report, requires_score_image
)
select
  'sat-pt10-irt-2026',
  'SAT Practice Test 10 scoring study',
  id,
  true,
  true
from public.practice_tests_v2
where name = 'SAT Practice Test 10 (Adaptive)'
on conflict (id) do update
set name = excluded.name,
    practice_test_id = excluded.practice_test_id,
    requires_html_report = excluded.requires_html_report,
    requires_score_image = excluded.requires_score_image,
    updated_at = now();

alter table public.bluebook_submissions
  add column campaign_id text references public.bluebook_calibration_campaigns(id) on delete restrict,
  add column planned_pattern_id text check (planned_pattern_id is null or length(planned_pattern_id) <= 80),
  add column score_summary_artifact_path text,
  add column form_fingerprint text,
  add column response_snapshot jsonb not null default '[]'::jsonb;

comment on column public.bluebook_submissions.campaign_id is
  'Optional controlled scoring-study campaign. NULL means an ordinary contribution.';
comment on column public.bluebook_submissions.planned_pattern_id is
  'Optional assignment code supplied by the study coordinator; never a student identifier.';
comment on column public.bluebook_submissions.score_summary_artifact_path is
  'Required on new submissions. Private Storage path for the image that substantiates the manually entered section score(s).';
comment on column public.bluebook_submissions.form_fingerprint is
  'SHA-256 fingerprint of the report answer-key/form structure used to detect a revised or mismatched Bluebook form.';
comment on column public.bluebook_submissions.response_snapshot is
  'Immutable item metadata captured at ingestion: question id, route, ordinal, correctness, difficulty, score band, type, domain, and skill.';

create index bluebook_submissions_campaign_idx
  on public.bluebook_submissions(campaign_id, created_at desc)
  where campaign_id is not null;
create index bluebook_submissions_form_fingerprint_idx
  on public.bluebook_submissions(form_fingerprint)
  where form_fingerprint is not null;

create table public.bluebook_calibration_responses (
  submission_id  uuid not null references public.bluebook_submissions(id) on delete cascade,
  section         text not null check (section in ('reading_writing', 'math')),
  module_number   smallint not null check (module_number in (1, 2)),
  route_code      text not null check (route_code in ('std', 'easy', 'hard')),
  ordinal         integer not null check (ordinal >= 0),
  question_id     uuid not null references public.questions_v2(id) on delete restrict,
  is_correct      boolean not null,
  chosen          text,
  difficulty      smallint check (difficulty between 1 and 3),
  score_band      smallint check (score_band between 1 and 7),
  question_type   text not null,
  domain_code     text,
  domain_name     text,
  skill_code      text,
  skill_name      text,
  captured_at     timestamptz not null default now(),
  primary key (submission_id, section, module_number, ordinal)
);

comment on table public.bluebook_calibration_responses is
  'Normalized, immutable item-level snapshot generated from bluebook_submissions.response_snapshot. Train scoring models from this table, not score_conversion.';

create index bluebook_calibration_responses_question_idx
  on public.bluebook_calibration_responses(question_id, is_correct);
create index bluebook_calibration_responses_features_idx
  on public.bluebook_calibration_responses(section, route_code, score_band, question_type);

-- Guard the new evidence contract and prevent metadata drift after the
-- submission has been reviewed. Existing rows remain valid; the image
-- requirement applies to INSERTs from this migration forward.
create or replace function public.tg_bluebook_scoring_study_validate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_campaign public.bluebook_calibration_campaigns%rowtype;
begin
  if tg_op = 'INSERT' and new.score_summary_artifact_path is null then
    raise exception 'bluebook_submissions: a score-summary screenshot is required'
      using errcode = '23514';
  end if;

  if jsonb_typeof(new.response_snapshot) <> 'array' then
    raise exception 'bluebook_submissions: response_snapshot must be a JSON array'
      using errcode = '23514';
  end if;

  if new.campaign_id is not null then
    select * into v_campaign
    from public.bluebook_calibration_campaigns
    where id = new.campaign_id and is_active;

    if not found then
      raise exception 'bluebook_submissions: calibration campaign % is unavailable', new.campaign_id
        using errcode = '23514';
    end if;
    if new.practice_test_id <> v_campaign.practice_test_id then
      raise exception 'bluebook_submissions: campaign % is for a different practice test', new.campaign_id
        using errcode = '23514';
    end if;
    if v_campaign.requires_html_report
       and (new.entry_method <> 'html_upload' or new.html_artifact_path is null) then
      raise exception 'bluebook_submissions: campaign % requires an uploaded HTML Details report', new.campaign_id
        using errcode = '23514';
    end if;
    if v_campaign.requires_score_image and new.score_summary_artifact_path is null then
      raise exception 'bluebook_submissions: campaign % requires a score-summary screenshot', new.campaign_id
        using errcode = '23514';
    end if;
    if new.form_fingerprint is null or jsonb_array_length(new.response_snapshot) = 0 then
      raise exception 'bluebook_submissions: campaign % requires a recognized form and item snapshot', new.campaign_id
        using errcode = '23514';
    end if;
    if new.rw_scaled is not null and new.rw_m2_route is null then
      raise exception 'bluebook_submissions: the Reading and Writing module 2 form could not be identified'
        using errcode = '23514';
    end if;
    if new.math_scaled is not null and new.math_m2_route is null then
      raise exception 'bluebook_submissions: the Math module 2 form could not be identified'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.campaign_id is distinct from old.campaign_id or
    new.planned_pattern_id is distinct from old.planned_pattern_id or
    new.score_summary_artifact_path is distinct from old.score_summary_artifact_path or
    new.form_fingerprint is distinct from old.form_fingerprint or
    new.response_snapshot is distinct from old.response_snapshot or
    new.responses is distinct from old.responses
  ) then
    raise exception 'bluebook_submissions: evidence and response snapshots are immutable after ingestion'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists bluebook_scoring_study_validate on public.bluebook_submissions;
create trigger bluebook_scoring_study_validate
  before insert or update on public.bluebook_submissions
  for each row execute function public.tg_bluebook_scoring_study_validate();

-- Materialize the immutable JSON snapshot into a normalized table in
-- the same transaction as the parent insert. The function is not a
-- callable API endpoint; EXECUTE is revoked after the trigger is made.
create or replace function public.tg_bluebook_materialize_response_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bluebook_calibration_responses (
    submission_id, section, module_number, route_code, ordinal,
    question_id, is_correct, chosen, difficulty, score_band,
    question_type, domain_code, domain_name, skill_code, skill_name
  )
  select
    new.id,
    x.item ->> 'section',
    (x.item ->> 'module_number')::smallint,
    x.item ->> 'route_code',
    (x.item ->> 'ordinal')::integer,
    (x.item ->> 'question_id')::uuid,
    (x.item ->> 'is_correct')::boolean,
    nullif(x.item ->> 'chosen', ''),
    nullif(x.item ->> 'difficulty', '')::smallint,
    nullif(x.item ->> 'score_band', '')::smallint,
    x.item ->> 'question_type',
    nullif(x.item ->> 'domain_code', ''),
    nullif(x.item ->> 'domain_name', ''),
    nullif(x.item ->> 'skill_code', ''),
    nullif(x.item ->> 'skill_name', '')
  from jsonb_array_elements(new.response_snapshot) as x(item);

  return new;
end;
$$;

revoke all on function public.tg_bluebook_materialize_response_snapshot() from public, anon, authenticated;

drop trigger if exists bluebook_materialize_response_snapshot on public.bluebook_submissions;
create trigger bluebook_materialize_response_snapshot
  after insert on public.bluebook_submissions
  for each row execute function public.tg_bluebook_materialize_response_snapshot();

alter table public.bluebook_calibration_campaigns enable row level security;
alter table public.bluebook_calibration_responses enable row level security;

create policy bluebook_campaigns_contributor_read
  on public.bluebook_calibration_campaigns
  for select to authenticated
  using (public.can_contribute());

create policy bluebook_calibration_responses_owner_read
  on public.bluebook_calibration_responses
  for select to authenticated
  using (exists (
    select 1
    from public.bluebook_submissions s
    where s.id = submission_id and s.contributor_id = (select auth.uid())
  ));

create policy bluebook_calibration_responses_staff_read
  on public.bluebook_calibration_responses
  for select to authenticated
  using (public.is_teacher());

grant select on public.bluebook_calibration_campaigns to authenticated;
grant select on public.bluebook_calibration_responses to authenticated;

-- Keep the bucket private, but permit the second evidence type.
update storage.buckets
set allowed_mime_types = array[
  'text/html', 'text/plain', 'application/octet-stream',
  'image/png', 'image/jpeg', 'image/webp'
]
where id = 'bluebook-reports';
