# Session handoff — Phase 2 dev-DB setup

**For:** the next Claude Code session that picks up this work.
**From:** the session that finished on 2026-04-15 blocked on the
network allowlist.
**Delete this file** at the end of Phase 2 once the dev DB is
stable and the Phase 2 step 9 RLS rewrite is in. It's a handoff
crumb, not a long-lived doc.

**Before reading further:** `CLAUDE.md` at the repo root auto-loaded
at session start and contains the big-picture motivation for the
rebuild plus the "flag before acting if a change would contradict
the five findings" directive. This handoff doc assumes you've
already internalized that frame; it only covers the tactical
in-flight state.

---

## TL;DR

1. The dev Supabase replay (`scripts/tmp-dev-replay.sql`) is **green** — all 64 migration files run end-to-end after a big batch of sort-order fixes that landed on the current branch.
2. We tried to give this session direct SQL access to the dev DB via a Supabase Management-API Personal Access Token (PAT). The code is in place (`scripts/dev-db-query.mjs`), but the prior session's sandbox had `api.supabase.com` blocked at the harness network layer, so nothing actually ran against the dev DB.
3. The user (Joe) then added `api.supabase.com` to the account-level domain allowlist **and** installed the Supabase MCP connector with Always Allow. Those changes don't take effect mid-session, which is why you (the new session) exist.
4. **First thing to do in this session: verify both changes actually took effect.** Instructions below.
5. After verification, pick up Phase 2 step 9 (RLS rewrite to use `can_view()` directly), which is the reason we need dev-DB access in the first place.

---

## Step 0 — Re-create the dev-DB env file

`~/.dev-db-env` (outside the repo) held `SUPABASE_DEV_PAT` + `SUPABASE_DEV_PROJECT_REF` in the last session. We don't know whether that file persists across sessions in Claude Code web, so **assume it doesn't**.

Ask the user to re-paste the PAT. The project ref is `ikzhizgsawzjpuuznfid` (dev only — `scripts/dev-db-query.mjs` hard-asserts this via `EXPECTED_PROJECT_REF`).

Then write the file with:

```bash
umask 077 && cat > ~/.dev-db-env <<'EOF'
export SUPABASE_DEV_PAT='sbp_...'      # paste from user
export SUPABASE_DEV_PROJECT_REF='ikzhizgsawzjpuuznfid'
EOF
```

**Important:** the PAT the user gave last session (`sbp_de32...`) is in the prior session's conversation transcript. Remind the user to rotate it after Phase 2 step 9 is done — see "Obligations" at the bottom.

---

## Step 1 — Verify the network allowlist took effect

```bash
curl -sS -o /dev/null -w "api.supabase.com: %{http_code}\n" https://api.supabase.com/v1/
```

- `200` / `401` / `404` → allowlist worked. Proceed to step 2.
- `403` with body `Host not in allowlist` → still blocked. Stop. Tell the user, and consider the fallback: GitHub Actions relay (see "Fallback" below).

---

## Step 2 — Verify the Supabase MCP connector registered

```
ToolSearch query: "supabase database project"
```

- If `mcp__supabase__*` tools appear → connector registered. Prefer it over `dev-db-query.mjs` because the per-tool permission gate is nicer UX for the user.
- If no Supabase tools appear → connector didn't register. Fall back to `dev-db-query.mjs`.

Either way, both paths need the allowlist from step 1 — the MCP connector still has to reach `api.supabase.com`.

---

## Step 3 — Smoke test

Whichever path worked, run:

```sql
select current_database() as db, current_user as usr, version() as pg_version;
```

via `node scripts/dev-db-query.mjs --sql "..."` or via the MCP tool. Confirm we're hitting the dev DB (not prod — check the `current_database()` output and confirm the project ref is `ikzhizgsawzjpuuznfid`).

Then run:

```sql
select count(*) as table_count
from information_schema.tables
where table_schema = 'public';
```

Expected: ~65 tables (matches the production table list the user pasted during the replay debugging). If it's way off, the replay didn't actually complete and we need to re-run `scripts/tmp-dev-replay.sql` in the Supabase dashboard.

---

## Step 4 — Phase 2 step 9: RLS rewrite to use `can_view()`

This is the real work unlocking dev-DB access. The plan is in `docs/architecture-plan.md` §4 Phase 2 item 9 (search for "Fix the RLS drift using `can_view()`").

**Precondition:** run the back-test script (`scripts/can_view_backtest.mjs` — exists from Phase 1 item 12) against the dev DB and confirm zero diffs between `can_view(target)` and the current helper-function decisions.

Current state of the back-test script: it's written but has never been run, because we didn't have a dev DB until now.

**Then:** rewrite every policy that still does `exists (select 1 from profiles)` to use the JWT-based helpers (`is_admin()` / `is_teacher()`) or the unified `can_view()` function. Gate each policy change on the back-test returning zero diffs for that specific (viewer, target) pair.

**After the RLS rewrite:** delete the bridge RPCs that exist purely to work around narrow RLS:
- `get_visible_students_with_stats` (migration `20240101000005` + delegate update `20240101000006`)
- `get_visible_student_by_id` (migration `20240101000007`)
- `get_visible_student_attempts` (migration `20240101000009`)
- `get_practice_volume_by_week` — check whether this also becomes redundant

And revert the tutor pages to plain queries (currently they go through the bridge RPCs).

---

## Obligations — things that MUST happen before this branch is mergeable

1. **Rotate the dev-DB PAT.** The one pasted in the last session is in that conversation transcript. Generate a fresh one after Phase 2 step 9 and revoke the old one at https://supabase.com/dashboard/account/tokens.
2. **Revert `scripts/tmp-dev-replay.sql`.** It's a temporary 4,654-line concatenated artifact committed in `cedb520` ("Temporary: concatenated migration replay for dev project") + updated in later commits. Once dev-DB access is stable and seeded, `git rm scripts/tmp-dev-replay.sql` and commit.
3. **Delete `docs/session-handoff.md`** (this file) at the end of Phase 2.
4. **Delete the bridge RPCs** once Phase 2 step 9 lands (see step 4 above).

---

## Key files

- `docs/architecture-plan.md` — 1,182-line master plan. Phase 2 in §4.
- `docs/runbook.md` — operational docs.
- `docs/database.md` — schema overview.
- `scripts/dev-db-query.mjs` — dev DB SQL helper (safety rails inside).
- `scripts/tmp-dev-replay.sql` — temporary concatenated replay (delete eventually).
- `scripts/can_view_backtest.mjs` — Phase 1 item 12 back-test, precondition for step 9.
- `supabase/migrations/20240101000004_create_can_view_function.sql` — the unified visibility function.
- `supabase/migrations/20240101000005_create_get_visible_students_with_stats.sql` and `20240101000006-9` — the bridge RPCs to delete after step 9.

## Recent commits to know about (do NOT redo any of these)

```
4ecbaa8 scripts: add dev-db-query.mjs helper for Management API SQL
492e196 migrations: timestamp-prefix remaining create_*.sql files with ordering conflicts
bfe9309 Dev replay fix: rename create_act_tables to sort early
50fc69d Dev replay fix: define shared set_updated_at trigger function
14488a7 Dev replay fix: sort all profile-altering migrations early
f02bbf3 Dev replay fix: sort tsa + mta early, split pta policies late
5c28e57 Rename create_account_tiers to sort early (fixes dev replay)
5523f11 Backfill v1 question schema + reset-and-replay dev replay file
fefc0f6 Fix lesson_topics primary key expression + regen replay files
cedb520 Temporary: concatenated migration replay for dev project
```

The migration rename sweep is done. The replay runs clean end-to-end. Don't touch migration sort order without a specific error to fix.

---

## Fallback: GitHub Actions relay

If step 1 fails (allowlist still blocked after session restart), the fallback is a GitHub Actions workflow that takes SQL from a committed file and runs it against the dev DB using the PAT stored as a repo secret. Design:

- Workflow triggers on push to `dev-db-apply/*` branches
- Reads `scripts/dev-sql/<file>.sql` from the pushed branch
- POSTs it to the Management API `/database/query` endpoint with the PAT from `secrets.SUPABASE_DEV_PAT`
- Writes the response to the workflow run log
- Next Claude session reads the run log via the GitHub MCP tools

This is slower than the direct path (minutes per query instead of seconds) but works without any allowlist changes. Only build it if step 1 verifies the allowlist didn't work.

---

## Where Phase 2 stands overall

Completed and landed:
- Student tree: dashboard, practice start, practice session, review
- Tutor tree: dashboard, student detail, training start, training session
- Admin tree: landing + users tab (first two carve-outs)
- Bridge RPCs for the narrow-RLS workaround
- `can_view()` + `list_visible_users()` functions
- All migrations replay clean on the dev DB

Still pending after step 9:
- Admin tab carve-outs: performance, content, questionsV2, questionsV2Bulk (four more pages)
- Phase 2 step 10 and onward (content-protection wiring)
