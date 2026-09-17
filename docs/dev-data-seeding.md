# Development data seeding

These utilities populate `studyworks-dev` with a small, useful data set without copying production users or student activity.

## Safety boundaries

- The source project is fixed to production ref `noqtadytxyslkoetchrs`.
- The destination project is fixed to development ref `ikzhizgsawzjpuuznfid`.
- Only the 58 question IDs in `scripts/seed-question-ids.txt` and their concept-tag links are copied.
- Staff identity fields are nulled, counters restart at zero, and rendered/derived columns are omitted.
- Profiles, auth users, assignments, and attempts are never copied from production.
- Assignment activity is generated only for four exact `@test.studyworks` synthetic users already present in development.

Never place a Supabase secret or legacy `service_role` key in a repository file, shell script, command-line argument, or PR description. Supply keys through the process environment.

## 1. Preview the question import

Set these environment variables using the secret-management method for your shell or development environment:

```text
PROD_SUPABASE_URL=https://noqtadytxyslkoetchrs.supabase.co
PROD_SUPABASE_SECRET_KEY=...
DEV_SUPABASE_URL=https://ikzhizgsawzjpuuznfid.supabase.co
DEV_SUPABASE_SECRET_KEY=...
```

Legacy `PROD_SERVICE_ROLE_KEY` and `DEV_SERVICE_ROLE_KEY` variables are also accepted during Supabase's migration to secret keys.

Run the importer without a flag. Dry-run mode is the default and performs no writes:

```sh
node scripts/seed-dev-from-prod.mjs
```

Review the reported question and tag-link totals before continuing.

## 2. Import the questions

Use the explicit write flag:

```sh
node scripts/seed-dev-from-prod.mjs --write
```

The script stops if either project URL is not the expected ref, a requested question or concept tag is missing, a database call fails, or the copied content fails its fidelity comparison.

## 3. Generate assignments and attempts

Run `scripts/seed-dev-assignments.sql` against `studyworks-dev` only after the question import succeeds. The SQL transaction checks the exact synthetic identities and minimum question counts before deleting or inserting anything.

The script creates three fixed-ID assignments, three synthetic roster members per assignment, and deterministic attempts. It is safe to rerun: only those fixed assignment IDs and their generated activity are replaced.

## Expected result

| Data | Count |
| --- | ---: |
| Imported questions | 58 |
| Concept-tag links | 24 |
| Generated assignments | 3 |
| Assignment roster rows | 9 |
| Generated attempts | 106 |

The expected assignment sizes are 12 math questions, 12 Reading and Writing questions, and 16 mixed questions.

## Resetting a test student to first login

Admins can put a flagged student back at "first login" without
creating a new account, from **Admin → Users → the student → Testing**
(2026-09-17):

1. Flag the account as a **test account** (`profiles.is_test`). Only
   students can be flagged, never demo accounts. The dev seed flags
   every `*@test.studyworks` student.
2. **Reset to first login**: type the account's email to confirm. One
   transactional DB function (`reset_test_student`, migration
   `20260917120000_test_student_reset.sql`) deletes everything the
   student generated — attempts, sessions, plans and tasks, the intake
   row, mastery snapshots, review queue, lesson progress, notes, error
   notes, flashcards, saved calculator states, ACT and practice-test
   attempts, reading-coach sessions, official scores — and clears
   target score, test date, and the practice-test import stamp. It
   keeps the auth user, name/email, role, tutor and class links,
   assignments, subscription/entitlement rows, invite-code claims, and
   tutor-authored notes.
3. Optional **re-send the welcome email** (clears
   `welcome_email_sent_at`); off by default so resets do not spam the
   test inbox.

Guards live inside the function and are re-checked there: caller must
be an admin, target must be a flagged student, never demo, and never an
account with an active/trialing/past-due subscription. The dismissed
help-banner state lives in the browser, so a fully clean run means a
private window. The Playwright onboarding spec
(`tests/e2e/onboarding.student.spec.ts`) uses the same function via the
admin storage state to reset `student4` before walking the intake.
