# Supabase east-region migration

## Projects and current phase

| Role | Project | Ref | Region |
| --- | --- | --- | --- |
| Production source | SAT Question Bank | `noqtadytxyslkoetchrs` | `us-west-2` |
| New production destination | Studyworks Content Bank | `yggbqwlvscuzuqqpwzpj` | `us-east-1` |

Preparation started on October 30, 2026. The destination was confirmed healthy
and empty: no application tables, Auth users, or Storage objects. Production
still uses the west project and Vercel `pdx1`. No cutover has occurred.

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
This validates the tooling on a fixture; the production-data rehearsal awaits
direct database credentials.

## Private access and preparation

Keep credentials and all exports outside the repository in
`/private/tmp/studyworks-east-migration/`, with directory mode `0700` and
file mode `0600`. This temporary directory is working space, not a durable
disaster-recovery backup. Retain a verified production backup through the
existing backup process before cutover.

The private `access.env` file contains:

```text
SOURCE_DATABASE_URL=<source direct or Session pooler PostgreSQL URI>
TARGET_DATABASE_URL=<destination direct or Session pooler PostgreSQL URI>
SUPABASE_ACCESS_TOKEN=<short-lived management token>
```

Use the Session pooler on port 5432 when direct IPv6 is unavailable. Passwords
in URIs must be percent-encoded. Do not put credentials into shell history,
command-line arguments, logs, commits, or chat messages. Node's `--env-file`
reads these values without evaluating shell substitutions.

Prefer a token scoped to these two projects. Configuration export needs read
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
not command arguments. Backup refuses a nonempty destination.

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

The preparation runner exports artifacts only. Restore, Storage transfer,
URL rewriting, settings changes, preview creation, and cutover must be
implemented and verified as those phases are reached; they are not implied
to have happened by running `backup`.

## Production cutover

Set the maintenance window after the rehearsal establishes the actual export,
restore, validation, and build times. The user has authorized starting the
migration; no maintenance window has been selected yet.

- Freeze writes at every entry point, including already-open browser clients
  using the old Supabase URL, account creation, server/API writes, imports,
  scheduled jobs, and external webhooks. An app maintenance screen alone
  does not enforce this. Verify the freeze using the actual API paths.
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
  `LOGIN_SETUP_SECRET` fallbacks) so in-flight links are handled deliberately.
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
