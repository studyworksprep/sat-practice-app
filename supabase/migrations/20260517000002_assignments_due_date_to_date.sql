-- assignments_v2.due_date: timestamptz → date
--
-- The column has always been used as a calendar date — the New
-- Assignment form takes its value from an <input type="date">
-- (a bare YYYY-MM-DD string) and every renderer drops the time
-- component. But it was stored as timestamptz and (incidentally,
-- via new Date('YYYY-MM-DD').toISOString()) every value happens
-- to land on midnight UTC. That convention silently broke every
-- reader: Supabase returns the column as `2026-05-24T00:00:00+00:00`,
-- which `new Date(...).toLocaleDateString()` then renders as
-- "May 23" for anyone in a UTC-negative timezone. Date.parse +
-- < now had the same off-by-one problem on the overdue flag.
--
-- The clean fix is to make the column type match the meaning. As
-- a `date`, Supabase returns bare "2026-05-24"; lib/formatters.js
-- already special-cases that string (parseLocalOrIso) and renders
-- it correctly as local midnight, with no timezone shift.
--
-- Safety check before applying: every existing due_date value is
-- exactly midnight UTC (verified on prod, 128/128 rows). So the
-- USING clause `(due_date AT TIME ZONE 'UTC')::date` is lossless
-- — it picks the same calendar date the tutor originally entered.

alter table public.assignments_v2
  alter column due_date type date
  using (due_date at time zone 'UTC')::date;
