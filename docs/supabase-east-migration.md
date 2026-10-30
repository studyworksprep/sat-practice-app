# Supabase east-region migration

## Projects and current phase

| Role | Project | Ref | Region |
| --- | --- | --- | --- |
| Production source | SAT Question Bank | `noqtadytxyslkoetchrs` | `us-west-2` |
| New production destination | Studyworks Content Bank | `yggbqwlvscuzuqqpwzpj` | `us-east-1` |

Preparation started on October 30, 2026. The destination was initially healthy
and empty. A rehearsal copy is now restored and locally tested. Production
still uses the west project and Vercel `pdx1`. No cutover has occurred. This
branch changes Vercel to `iad1` for the east preview; do not merge that change
before coordinating the production environment switch and final data refresh.

The source runs PostgreSQL 17.6; the destination runs 17.11. Both have the same
installed extensions. Initial inspection found no Vault secrets or operators
with custom selectivity estimators. Check pgcrypto usage and restore
compatibility in the rehearsal; an empty Vault alone does not establish that
application columns contain no encrypted data.

Source inventory at preparation: 96 Auth users, 91 public application tables,
17 `_legacy` tables, and 50 files across five Storage buckets. These are a
baseline, not an assertion that production stopped changing. The existing
development project `ikzhizgsawzjpuuznfid` is outside this migration.

Read-only catalog inspection also confirmed that all 271 Auth columns match
between the projects, including types, defaults, and nullability. The source
has 505 policies across the application and managed schemas, including 12
Storage policies. Private catalog snapshots contain the exact table counts
and definitions for comparison after import.

Local verification passed on PostgreSQL 17.11 using an isolated temporary
container with no network access. All five official export scripts restored
successfully into a second fixture database. The round trip preserved Auth
IDs/password hashes, the account-creation trigger, application/Storage policies,
legacy content, JSON/Unicode/TeX/multiline strings, migration history, and the
identity sequence. A write through the read-only export connection was rejected.
The subsequent production-data rehearsal also passed, using temporary
migration credentials without resetting the existing database password.

## Completed rehearsal checks

- The initial snapshot restored 148,183 rows across 139 data tables, including
  96 Auth users. Row fingerprints, sequence values, migration history, all 505
  policies, and custom managed-schema triggers matched before test activity.
- All 50 Storage files (4,585,934 bytes) were copied and byte-verified. All five
  bucket configurations and object ownership were preserved.
- Sixty-two public Storage URL references were mapped to the east project in
  48 rows across five tables. Nine valid rendered-content hashes were updated;
  other row fields and existing stale/null hash markers were preserved.
- New-project defaults initially added grants to 25 functions and 11 tables.
  A separate target-only reconciliation removed the extra grants. Effective
  grants and ownership now match the source across all 212 application objects.
  No column-specific grants were present.
- A local production build passed. Student and tutor demo sessions reached
  their dashboards, and both were blocked from writing through the API. Demo
  login generates a session without sending email. These checks do not measure
  end-user regional latency.
- Migration guard tests pass locally. The CI workflow also runs these tests.
- The populated candidate was refreshed from the snapshot in one transaction.
  All rows, sequence values, history, policies, and the reviewed schema matched
  again. Files and URL transformations were reapplied and verified afterward.
- A transient lock rehearsal covered all 140 snapshot/history tables: ordinary
  reads worked, Auth/Storage/application writes blocked, and rollback restored
  writes. Durable guards were also tested on 112 application, Auth-user,
  Storage-object/bucket, and history tables. Guard creation, rejection, removal,
  and cleanup passed in a rolled-back candidate transaction.
- The protected `iad1` preview passed browser checks for the home page,
  anonymous redirect, both demo dashboards, practice picker, and demo write
  restrictions, with no browser application errors. All 39 public files loaded
  with matching hashes; all 11 private files rejected anonymous access.
- Live preview logs showed median successful requests through `IAD` of 25 ms
  for `/auth/v1/user` (97 requests), 29 ms for profiles (81), and 26 ms for
  `has_plan` (63). These are backend origin timings during the rehearsal,
  not a controlled South Florida page-load benchmark.

The private snapshot and verification reports are in
`/private/tmp/studyworks-east-migration/backup-2026-10-30T18-23-22.679Z/`,
with permission-reconciliation reports in its parent directory.

Auth templates, redirects, and nonsecret settings were copied. The Auth
configuration API returns a fingerprint for `smtp_pass`, not the original SMTP
credential. A real Resend SMTP credential was then obtained privately from the
existing Vercel configuration, and SMTP authentication passed without sending
email. The candidate's custom SMTP remains cleared during rehearsal; the
verified credential is staged privately for cutover. Do not copy secret
fingerprints as keys. Production SMTP is unchanged.

The Vercel migration branch has its own east-project keys. Its external email,
billing, sync, cron, AI/import-provider, shared Redis, and Sentry credentials
are disabled for rehearsal. Other preview branches and production settings
are unchanged. Vercel's existing preview access protection remains enabled.

The populated-target refresh and write guards are implemented and rehearsed.
The initial restore command still refuses a populated target. The west project
remains writable, so this snapshot is a rehearsal baseline rather than a final
production copy. Production has completed daily Supabase backups, including
October 30 at 11:45 UTC; point-in-time recovery was not enabled at inspection.

## Private access and preparation

Keep credentials and all exports outside the repository in
`/private/tmp/studyworks-east-migration/`, with directory mode `0700` and
file mode `0600`. This temporary directory is working space, not a durable
disaster-recovery backup. Retain a verified production backup through the
existing backup process before cutover.

The private `access.env` file contains a management token. Database URLs are
optional; leave them blank or enter the exact project API origin to discover
Session pooler endpoints and use Supabase-managed temporary migration logins.
Existing database passwords do not need to be recovered or reset.

```text
SOURCE_DATABASE_URL=
TARGET_DATABASE_URL=
SUPABASE_ACCESS_TOKEN=<short-lived management token>
```

If supplying a database password, use the Session pooler on port 5432 when direct IPv6 is unavailable. Passwords
in URIs must be percent-encoded. Do not put credentials into shell history,
command-line arguments, logs, commits, or chat messages. Node's `--env-file`
reads these values without evaluating shell substitutions.

Prefer a token scoped to these two projects. Temporary migration logins need
Database read-write (for the platform login-role API) and Connection Pooling
read. The restricted read-only-user login cannot access the managed Auth
schema; the CLI migration login can, and all export/query transactions enforce
read-only mode separately. Login passwords expire after 300 seconds and are
refreshed before new operations as needed. They are held in memory, never
printed or added to connection command arguments. Existing application
database passwords and access policies are unchanged.

Configuration export needs read
access; copying destination settings needs the corresponding write access.
Retrieving server API keys for Storage transfer additionally requires API Key
Secrets permission. The tool reports missing access without printing secrets.

```sh
node --env-file=/private/tmp/studyworks-east-migration/access.env scripts/supabase-east-migration.mjs check-access
node --env-file=/private/tmp/studyworks-east-migration/access.env scripts/supabase-east-migration.mjs inventory
node --env-file=/private/tmp/studyworks-east-migration/access.env scripts/supabase-east-migration.mjs backup
```

All database connections in this preparation tool enforce read-only mode.
Project refs, regions, database names, connection hosts, and TLS settings are
validated before use. Passwords are passed through subprocess environments,
not command arguments. Source export can run while the candidate is populated;
the separate restore/refresh tools enforce their own destination guards.

The official Supabase CLI 2.122.0 is installed in the private `tooling/`
directory without changes to application dependencies. Its inspected
`db dump --dry-run` scripts use placeholder connections and are stored as
`official-{roles,schema,data,history-schema,history-data}-dump.sh`.
The runner removes only the known placeholder exports and executes the scripts
with the source's read-only connection. It resolves the official
`postgres:17-alpine` image to an immutable digest before use. The host's
PostgreSQL 16 `pg_dump` cannot export this PostgreSQL 17 database.

## Rehearsal sequence

1. Validate access and capture the inventory. Export roles, application schema,
   data, migration history, and custom objects on managed schemas. Inspect
   generated SQL and create a hash manifest before any restore.
2. Compare source and destination Auth/Storage managed table definitions.
   Preserve destination platform migrations. Review incompatible columns,
   custom database roles, grants, and extension references before importing.
3. Restore into the new, empty east project using the official migration
   procedure and a transaction with `ON_ERROR_STOP`. Scope writes to the new
   project. Never restore into the source or development project.
4. Restore the custom `auth.users` account-creation trigger and the 12 Storage
   policies. The normal application schema dump excludes managed schemas.
   Preserve RLS, ownership, grants, functions, views, indexes, and sequences.
5. Copy all five Storage buckets through the Storage API, preserving paths,
   access settings, MIME types, and required ownership metadata. Verify file
   counts, sizes, and byte hashes. Database Storage metadata is not the files.
6. Audit all application text/JSON fields for old Storage URLs, including
   rendered HTML, draft/history records, and nested lesson specs. Rewrite
   references on the destination only, preserving bucket and object paths.
   Account for update triggers, generated fields, and content hashes.
7. Copy reviewed project settings: Auth URLs/providers, SMTP/templates,
   Data API exposure and limits, Realtime publications/settings, and relevant
   database configuration. Keep production integrations/jobs inactive on the
   candidate. Do not copy JWT signing material just to avoid a new login.
8. Verify exact row counts and content fingerprints against the export before
   testing writes. Verify user IDs and password hashes privately, role/plan
   behavior, FK/sequence integrity, RLS policies, view security options,
   grants, trigger definitions, migration history, and file availability.
   Compare security/performance advisories with the source baseline.
9. Prepare a preview deployment with the east project's public/server keys
   and Vercel `iad1`. Never put server keys into `NEXT_PUBLIC_*` variables.
   Do not overwrite the existing development/E2E environment. Suppress
   outbound production email, Stripe actions, and scheduled jobs during tests.
10. Test existing-account login, password reset configuration, demo accounts,
    student/tutor/admin access, practice saves, progress, entitlements, images,
    and imports. Measure representative latency from the intended geography
    and inspect backend logs. Remove rehearsal-generated activity before the
    final import.

## Repeating the candidate refresh

The preparation runner exports artifacts only. Use the separate commands for
initial restore, populated refresh, files, and URL mapping. Each validates the
fixed project identities and snapshot checksums. The refresh preserves the
reviewed schema and grants, refuses schema/COPY-column drift or foreign keys
outside its exact write set, saves candidate activity privately, and truncates
only the exported data/history tables without `CASCADE`. Managed platform
migration tables are excluded. It uses `CONTINUE IDENTITY` because managed Auth
sequences require their owner for a reset; the export's `setval` statements and
verification restore the exact sequence state.

```sh
# Substitute the freshly exported, checksum-verified snapshot directory.
migration_snapshot_dir=/private/tmp/studyworks-east-migration/backup-2026-10-30T18-23-22.679Z
node --env-file=/private/tmp/studyworks-east-migration/access.env scripts/supabase-east-refresh.mjs "$migration_snapshot_dir" --apply
node --env-file=/private/tmp/studyworks-east-migration/access.env scripts/supabase-east-assets.mjs "$migration_snapshot_dir" storage --apply
node --env-file=/private/tmp/studyworks-east-migration/access.env scripts/supabase-east-assets.mjs "$migration_snapshot_dir" rewrite --apply
node --env-file=/private/tmp/studyworks-east-migration/access.env scripts/supabase-east-freeze.mjs "$migration_snapshot_dir" --rehearse-target
```

URL discovery is regenerated from each snapshot's COPY data and column metadata;
it is no longer tied to the initial audit. Signed/unknown URL classes and
unsupported column types stop automatic mapping. Do not run these candidate
refresh commands after the east project starts accepting production writes.

## Production cutover

Set the maintenance window after the rehearsal establishes the actual export,
restore, validation, and build times. The user has authorized starting the
migration; no maintenance window has been selected yet.

- Freeze writes at every entry point, including already-open browser clients
  using the old Supabase URL, account creation, server/API writes, imports,
  scheduled jobs, and external webhooks. An app maintenance screen alone
  does not enforce this. Verify the freeze using the actual API paths.
- Use one dedicated source transaction to hold `SHARE` locks on all exported
  tables while taking the final snapshot and copying files. A lost control
  connection releases its locks: abandon that attempt rather than promoting
  an export whose freeze was interrupted. After the final export, install the
  durable guards in that same transaction before committing it. This keeps
  the guards out of the east schema/data while blocking old clients on the
  west application, Auth-user, and final Storage metadata tables afterward.
  `freezeSql()` provides the exact matching removal SQL for a pre-reopen rollback.
  The CLI only plans or rehearses against the candidate; it cannot freeze
  production. Some newer platform-owned OAuth tables permit creating triggers
  but not removing them, so durable guards deliberately avoid those internals.
  The transient lock still covers their snapshot data while exporting.
- Do not rely on disabling legacy API keys as the write freeze. In the
  candidate rehearsal, Auth/REST eventually rejected them but Storage still
  accepted them. The candidate flag was restored and access verified. Neither
  the source's keys nor its signing settings were changed. A database default
  of `default_transaction_read_only` alone is also insufficient for Data API
  writes. The tested table locks and durable guards address these cases.
- Stop or retry webhook deliveries without acknowledging an event before it
  is durably recorded. Reconcile Stripe state and event ordering afterward.
- Take a fresh consistent export. Refresh the destination from that export
  using a rehearsed procedure that removes candidate-only test data and
  prevents conflicts in Auth and managed schemas. Apply the final Storage
  delta and URL transformations. Repeat fidelity and permission checks.
- Update production Supabase URL, public key, and server key together; change
  Vercel from `pdx1` to `iad1`; rebuild because public environment values are
  bundled into browser code. Check related settings and secrets whose values
  were derived from the old service key (`IMPORT_REVIEW_SECRET` and
  `LOGIN_SETUP_SECRET` fallbacks). Their existing seeds are staged privately;
  set them explicitly at cutover so in-flight links retain their signatures.
- Update GitHub production utility secrets `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_SERVICE_KEY` together. They are used
  by graph generation, math backfill, batch repair, and image-migration manual
  workflows. Preserve all `E2E_*` development secrets. The seed-from-production
  utility's expected production ref is updated on this branch for the move.
- Verify production with writes still held, then reopen and resume one set
  of jobs/webhooks. Plan for users to sign in again and reload stale clients.
- Keep the west project protected against stale writes during verification.
  Record the deployment SHA, export manifest, cutover time, and validation
  results. Retire the source only after a separate retention decision.

Before reopening writes, rollback can return to the source snapshot and
previous deployment. After accepting new east-region writes, rollback needs
data reconciliation; switching environment variables back would lose progress
and potentially billing updates.

## References

- [Change project region](https://supabase.com/kb/troubleshooting/change-project-region-eWJo5Z)
- [Official CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Migrating Auth users](https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects)
- [PostgreSQL 17.11 compatibility notes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
- [Scoped management tokens](https://supabase.com/changelog/scoped-personal-access-tokens-ga)
- [PostgreSQL table-lock compatibility](https://www.postgresql.org/docs/17/explicit-locking.html)
- [Supabase migration write-freeze limitations](https://supabase.com/kb/troubleshooting/putting-a-project-in-read-only-mode-or-freezing-writes-during-a-migration)
