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
