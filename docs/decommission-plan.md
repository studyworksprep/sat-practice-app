# Legacy tree decommission plan

The working checklist for retiring the legacy `app/` route tree and
making `app/next/` the sole framework. This is the concrete,
current-state companion to `docs/architecture-plan.md` §4 Phase 6 —
that section is the design intent; this file is what we actually do,
in order, with the audit that justifies each step.

_Started May 2026 on branch `claude/legacy-tree-decommission-wKzyC`;
restarted June 2026 on branch `claude/legacy-tree-decommission-v2-wKzyC`
after the original branch drifted ~90 commits / +10k LOC behind main
and clean merge became impractical._

> **Restart context (June 2026).** Stage A landed on main as part of
> the original attempt: the `profiles.ui_version` column-default
> migration is applied to prod, the `/features/*` decks are ported to
> `app/next/features/*`, `/features` is off `proxy.js`'s
> `TREE_AGNOSTIC_PREFIXES`, and `tests/e2e/features-parity.anon.spec.ts`
> exists. Stages B (Verified by owner — see below), C, and D still
> need execution. Before any Stage C deletion, the route-parity audit
> and `/api/*` keep-list cross-check from the original attempt must be
> **re-run against current main** — main accumulated significant
> feature work (AI question generation, lesson packs, weak-drill
> changes, manager-flag-as-broken, etc.) that may have added new pages
> and/or new `/api/*` calls that change the inventory.

---

## 0. Where the rebuild actually stands

The rebuild is far past the architecture plan's starting point.
Phases 1, 1.5, 2, 3, and the next-tree side of Phase 4 shipped to
production (see `docs/session-handoff.md`, migrations 000011–000024+).

**The decisive fact: the proxy default is already `next`.**
`proxy.js` resolves anonymous visitors and any user without an
explicit `ui_version='legacy'` to the new tree. The legacy tree is
now reachable only by:

1. Users explicitly pinned to `ui_version='legacy'`.
2. The `feature_flags.force_ui_version='legacy'` kill switch.
3. `/auth/callback` and `/auth/demo` route handlers (intentionally
   tree-agnostic, no UI — one copy is enough).

Decommissioning is therefore a deletion-and-cleanup exercise, not a
migration. The risk is not "will the new tree work" — it already
serves production — it is "did we delete something still in use."

---

## 1. Audit — migration goals vs. reality

| Goal (architecture plan) | State | Notes |
|---|---|---|
| Schema drift (`practice_test_*`, `get_question_neighbors`) | Resolved | Both committed to migrations; `get_question_neighbors` later dropped |
| Next 16 / React 19.2 / `middleware`→`proxy.js` | Done | |
| `can_view()` unified visibility + JWT role helpers | Done | migrations 000011–000013, verified on prod |
| Shared auth/response/paginate helpers | Done | `lib/api/auth.js`, `response.ts`, `paginate.js` |
| Assignment unification (`assignments_v2`) | Done | migrations 000021–000022 + continuous-sync trigger |
| Single `<QuestionRenderer>` (next tree) | Done | `lib/ui/QuestionRenderer.js`; legacy keeps its 3 copies until deletion |
| Error boundaries (next tree) | Done | route-group level + `app/next/error.js` + `app/global-error.js` |
| Server-side `practice_sessions` state | Done | `localStorage` use is now legacy-tree-only |
| Sentry observability | Done | server routes, RSC/actions, error boundaries, root layout |
| Route parity legacy → next | Closed in Stage A | see §2 |
| §3.5 critical-flow integration tests | Partial | 8 auth/demo/marketing specs exist; 5 flow tests still owed (Stage A) |
| TypeScript conversion | ~15%, ongoing | Explicitly background work; not a decommission blocker |
| Design tokens extracted from `globals.css` | Not done | Phase 5 polish; not a decommission blocker |

**Reframe on Phase 4/5 "incomplete" items.** The legacy tree's
2,000-line files, its three question renderers, and its 16
`localStorage` prefixes are *legacy-tree artifacts*. They are not
work items — they are resolved by deleting the legacy tree. The next
tree already has the consolidated renderer, error boundaries, and
server-side sessions. The §6 metrics in the architecture plan all
hit target *as a consequence of* Stage C deletion, not before it.

The only genuinely-open, non-blocking items are TypeScript adoption
(background, no deadline) and design-token extraction (polish). They
do not gate decommission and are tracked in the architecture plan,
not here.

---

## 2. Route-parity gaps and decisions

Every legacy page route was matched to a next-tree equivalent.
**41 legacy page routes** total (unchanged since May — the +90
commits of main work added no new legacy pages). Most are 1:1 URL
matches; the rest fall into renames, drops, and URL-shape changes:

| Legacy route(s) | Resolution | Status |
|---|---|---|
| `/features/*` (3 decks + 3 demo pages) | Port into the next tree | **Done — Stage A** |
| `/bugs` | Drop — bug reporting retired | Deleted in Stage C |
| `/admin/bulk-reocr` | Drop — never targeted for port | Deleted in Stage C |
| `/dashboard/recommendations` | Drop — surface retired (no next-tree equivalent) | Deleted in Stage C |
| `/account` (bare) | Not a real route (only `/account/billing` existed; ported) | No action |
| `/act-practice/import` | Already ported to `app/next/(admin)/admin/act/imports/*` | No action |
| `/teacher/*` (8 routes) | **URL rename** → `/tutor/*` (incl. `/tutor/dashboard`, `/tutor/roster`, `/tutor/performance`, `/tutor/teachers`, `/tutor/lesson-packs`, `/tutor/students/[id]/stats`, `/tutor/review/[id]`) | Redirect in `proxy.js` — Stage C |
| `/teachers` | **URL rename** → `/tutor/teachers` (manager view) | Redirect in `proxy.js` — Stage C |
| `/practice-test*` (3 routes) | **URL rename** → `/practice/test*` (and `/practice-test` → `/practice/tests`) | Redirect in `proxy.js` — Stage C (high-priority — emailed attempt URLs) |
| `/practice` | **URL-shape change** → `/practice/start` (subject/picker page) | Redirect in `proxy.js` — Stage C |
| `/practice/[questionId]` | **URL-shape change** → `/practice/s/[sessionId]/[position]` (single-question entry replaced by session-scoped flow) | Drop redirect (questionId → sessionId is not a mapping) — accept 404 |
| `/act-practice` and `/act-practice/[questionId]` | **URL-shape change** — unified into `/practice/start` (SAT+ACT picker) and `/practice/s/[sessionId]/[position]` | Redirect `/act-practice` → `/practice/start`; drop `/act-practice/[questionId]` |
| `/admin/lessons/[lessonId]/editor` | **URL rename** → `/admin/lessons/[lessonId]` (drops `/editor` suffix) | Redirect in `proxy.js` — Stage C |

All other ~25 routes are 1:1 URL matches.

`/bugs` is referenced only by the legacy `components/AdminDashboard.js`
— no next-tree code links to it. It is deleted with the rest of the
legacy tree in Stage C.

`/dashboard/recommendations` was missed by the May audit; the next
tree has no equivalent and the recommendations surface is retired.
Deleted with the rest of the legacy tree.

---

## 3. The decommission stages

### Stage A — Close parity gaps (non-destructive) — IN PROGRESS

- [x] Stop minting new legacy users. `profiles.ui_version` was
      created with `default 'legacy'` and `handle_new_user` inserts
      profiles without naming the column, so every signup became a
      legacy user — which made the Stage B "100% on next"
      precondition unreachable. Migration
      `20260521000000_default_ui_version_next.sql` flips the column
      default to `next`. **Applied to production 2026-05-21**
      (out-of-band, via Supabase MCP); replays on dev via
      `supabase db reset`.
- [x] Port `/features/*` marketing decks into `app/next/features/*`
      (6 pages; verbatim copies, `@/`-aliased imports, no layout —
      `app/next/layout.js` already supplies the `data-tree="next"`
      wrapper + tokens).
- [x] Remove `/features` from `proxy.js` `TREE_AGNOSTIC_PREFIXES` so
      next users get the new-tree decks; legacy users still get the
      legacy copies until Stage C.
- [x] Add `tests/e2e/features-parity.anon.spec.ts` — guards that
      every `/features/*` URL renders real content, not the
      `[...slug]` catch-all.
- [ ] Author the 5 §3.5 critical-flow integration tests against the
      seeded dev environment (`scripts/dev-seed-*.sql`, users
      `{admin,teacher,student1}@test.studyworks` / `devseed123`).
      These need a running app + dev DB to author and validate
      selectors, which the current session cannot do — see §5.
      Flows, by seed role:
      1. student — login → dashboard → start practice → answer → result
      2. student — full practice test → score report
      3. teacher — open student profile → review a wrong answer
      4. admin — open Questions V2 preview → approve a question
      5. Stripe checkout → webhook → subscription active (test-mode)
- [ ] Relocate `components/FeatureSlideshow.js` and
      `lib/tutorManagerDemoData.js` so they survive Stage C: move
      `FeatureSlideshow` into `lib/ui/` and update its remaining
      importer (`components/NavBar.js`, which is itself deleted in
      Stage C, so this can also just be deferred into the Stage C
      sweep). `tutorManagerDemoData.js` already lives in `lib/` and
      is safe.

### Stage B — Verify the Phase 6 precondition (no code) — COMPLETE

Owner-verified complete (June 2026): 100% of active production users
have been on the next tree for ~30 days with no regressions. Stage C
is unblocked.

### Stage C — Delete the legacy tree (destructive — needs sign-off) — **COMPLETE**

Shipped as four commits on this branch (June 2026):

- `b674e65` Stage C-1: 27,852 lines / 62 files removed.
- `151b961` Stage C-2: 13,358 lines / 88 routes removed.
- `cf05c73` Stage C-3: 292 files moved + proxy rewrite + redirects.
- `2a152c6` Stage C-4: 13 lines of token-scoping flip.

Typecheck stable at the same 6 pre-existing LessonPackBuilder errors
throughout. `npm run build` compiles cleanly; the only build-time
failure observed (sandbox prerender of /auth/update-password) is
environmental (missing `NEXT_PUBLIC_SUPABASE_URL` in the agent's
container, not a code issue — same prerender would fail on main).

**Audits refreshed June 2026** against current main. Findings below
were the authoritative inventory used for the deletion sub-steps.

#### C-1. Delete legacy route dirs

- [ ] Delete: `app/practice`, `app/act-practice`, `app/practice-test`,
      `app/dashboard`, `app/teacher`, `app/teachers`, `app/review`,
      `app/assignments`, `app/learn`, `app/flashcards`, `app/account`,
      `app/admin`, `app/login`, `app/subscribe`, `app/bugs`,
      `app/features`. (16 dirs.)
- [ ] Delete legacy-only `components/`: `AdminDashboard.js`,
      `NavBar.js`, `FeatureSlideshow.js` (relocate to `lib/ui/` first
      if any next-tree code still imports it — June audit shows
      next-tree `/features/*` imports it, so move not delete),
      `QuestionsV2*.js`, `ConceptTags.js`, `QuestionNotes.js`,
      `DesmosStateButton.js`, `Filters.js`, `FlashcardsModal.js`,
      `LandingClient.js`, `HtmlBlock.js` (check next-tree usage
      first). And `lib/practiceSessionStorage.js` (legacy-only —
      6 importers, all legacy).

#### C-2. Delete legacy-only `/api/*` route handlers

**Refreshed keep-list: 15 routes** (down from 16 — `/api/billing/status`
demoted to delete after June re-audit confirmed no next-tree caller).
**Delete count: 86** of 101 total handlers.

KEEP:

| Route | Why |
|---|---|
| `/api/webhooks/stripe` | Stripe webhook — external |
| `/api/external/score-report/[attemptId]` | external bucket |
| `/api/external/student-summary/[studentId]` | external bucket |
| `/api/public/students/[studentId]/practice-data` | public bucket |
| `/api/public/students/provision` | public bucket |
| `/api/public/students/search` | public bucket |
| `/api/signup` | `app/next/HomeClient.jsx` |
| `/api/billing/create-checkout` | `app/next/subscribe/SubscribeClient.jsx` |
| `/api/billing/create-portal` | `app/next/account/billing/ManagePortalButton.jsx` |
| `/api/practice-tests` | `app/next/(tutor)/.../UploadBluebookCard.jsx` |
| `/api/practice-test/time-ping` | `TestRunnerInteractive.js` (`sendBeacon`) |
| `/api/teacher/student/[studentId]/upload-bluebook` | `UploadBluebookCard.jsx`, `BluebookBatchInteractive.tsx` |
| `/api/admin/questions-v2/generate` | `GenerateAlternate.jsx` |
| `/api/admin/sync-lessonworks` | `vercel.json` daily cron |

DELETE — 86 routes spanning `act/*`, `admin/*` (excl. the two kept),
`assignments/*`, `teacher/*` (excl. the upload-bluebook route),
`practice-tests/*` (sub-routes; `/api/practice-tests` itself stays),
`practice-test/*` (excl. `time-ping`), `lessons/*`, `flashcard-sets`,
`flashcards*`, `questions*`, `review*`, `billing/status`, and the
top-level `attempts`, `concept-tags`, `dashboard*`, `desmos-states`,
`domain-counts`, `error-log`, `filters`, `me`, `progress`,
`question-notes`, `recommendations`, `sat-vocabulary`, `status`,
`time-analytics`. Each is called only from the legacy tree or
legacy-only components (confirmed June audit).

- [ ] Execute the deletions per the lists above.

#### C-3. Promote `app/next/*` to the route root, add legacy redirects

- [ ] `git mv` every `app/next/*` (excluding `app/next/api`, which
      doesn't exist — `/api/*` lives at `app/api/*`) up to `app/*`.
      Resolve any name collisions by deleting the legacy version
      first (handled in C-1 above).
- [ ] Simplify `proxy.js`: remove the tree resolver, `x-ui-tree`
      header, kill-switch read, `TREE_AGNOSTIC_PREFIXES`,
      `isTreeAgnostic`, `resolveUiTree`, `userTreeFromJwt`, and the
      rewrite logic. The remaining responsibilities are session
      refresh, role gating (`BLOCKED_FOR_PRACTICE`), subscription
      gating, and the demo-account write lockdown.
- [ ] Add legacy-URL redirects to `proxy.js` (308 permanent so
      bookmarks and search engines update):
      - `/teacher` → `/tutor/dashboard`
      - `/teacher/content` → `/tutor/lesson-packs`
      - `/teacher/content/[lessonId]` → `/tutor/lesson-packs/[id]`
      - `/teacher/performance` → `/tutor/performance`
      - `/teacher/review/[questionId]` → `/tutor/review/[questionId]`
      - `/teacher/students` → `/tutor/roster`
      - `/teacher/student/[studentId]/stats` → `/tutor/students/[studentId]/stats`
      - `/teachers` → `/tutor/teachers`
      - `/practice-test` → `/practice/tests`
      - `/practice-test/attempt/[attemptId]` → `/practice/test/attempt/[attemptId]`
        — high priority, emailed in score-report links
      - `/practice-test/attempt/[attemptId]/results` → `/practice/test/attempt/[attemptId]/results`
      - `/practice` → `/practice/start`
      - `/act-practice` → `/practice/start`
      - `/admin/lessons/[lessonId]/editor` → `/admin/lessons/[lessonId]`
      Drop (accept 404, no clean mapping):
      - `/practice/[questionId]` — questionId → sessionId is not a function
      - `/act-practice/[questionId]` — same
- [ ] Update `app/layout.js`: drop the `await headers()` /
      `x-ui-tree` plumbing and pass NavBar without the prop, since
      there's only one tree now.

#### C-4. Drop the next-tree CSS scoping

- [ ] Flip `app/styles/next-tokens.css` from `[data-tree="next"]`
      back to `:root` (now that legacy `globals.css` token bleeding
      is gone, there's nothing to scope around).
- [ ] Drop the wrapping `<div data-tree="next">` in the (now-promoted)
      `app/layout.js` (former `app/next/layout.js`) and the
      `uiTree`-conditional NavBar gate.

### Stage D — Schema & flag cleanup (destructive — needs sign-off) — **MOSTLY COMPLETE**

Most items shipped across two further branches in June 2026 (see §5
session log for the commit chain). Two cosmetic items remain.

- [x] Drop `profiles.ui_version` and the `force_ui_version`
      `feature_flags` row. Keep the `feature_flags` table.
- [x] Remove dual-write/continuous-sync triggers feeding
      `assignments_v2` from the legacy `question_assignments` /
      `lesson_assignments` tables. The `trg_question_assignment_v2_sync`
      and `trg_qas_v2_sync` triggers and their `sync_*` functions
      are dropped.
- [x] Archive v1 question tables + legacy SAT assignment tables to a
      `_legacy` schema (`questions`, `question_versions`,
      `answer_options`, `correct_answers`, `question_taxonomy`,
      `question_assignments`, `question_assignment_students`).
      Scope expanded during execution to also cover `question_id_map`,
      the v1 `practice_test_*` list cluster (3 tables) and attempt
      cluster (3 tables), and the two `lesson_assignment_*` tables.
      90-day hold timer starts from each archive migration's apply
      date; the final drop is a separate followup.
- [x] Retire `question_status`, its restored FK
      (`question_status_question_id_fkey`), and the
      `upsert_question_status_after_attempt` RPC — all legacy-only.
      Table archived to `_legacy`; the RPC was dropped earlier (it
      no longer exists in `public`).
- [x] Resolve the `question_concept_tags` v1-id FK noted in
      `docs/cutover-runbook.md` so concept tags can be written for
      v2-only questions. Done by Stage D-7 (migration
      `20260620140635_repoint_question_concept_tags_to_v2.sql`); a
      follow-up commit removed the stale v1↔v2 translation logic
      from 5 read paths (including a latent bug in
      `intersectTaggedQuestionIds` / `intersectTaggedV2Ids` that
      had silently returned empty intersections).
- [ ] Remove the Playwright dual-tree mode; tests run once against
      the single tree.
- [ ] Re-run the `docs/architecture-plan.md` §2 audit metrics and
      confirm every §6 target is hit.
- [x] Delete `docs/session-handoff.md` and `docs/cutover-runbook.md`
      (per-user cutover is moot once the legacy tree is gone).

---

## 4. Risks

- **Deleting an `/api/*` route still in use.** API routes are shared
  between trees and not all legacy-only. Mitigation: the Stage C
  per-segment `fetch(` cross-check; keep the explicit keep-list.
- **External callers.** `/api/webhooks/stripe`, `/api/external/*`,
  `/api/public/*` are non-browser callers — deleting them breaks
  integrations silently. They are on the keep-list.
- **`FeatureSlideshow` / demo-data orphaned.** The ported `/features`
  pages still import `components/FeatureSlideshow`. It must be
  relocated (Stage A item) before `components/` is swept in Stage C.
- **Schema archive irreversibility.** Stage D archives to `_legacy`
  rather than dropping; the actual drop is +90 days. Soft-delete
  everywhere means no irrecoverable delete path.
- **No rollback target after Stage C.** Once the legacy tree is
  deleted the kill switch has nowhere to send users. Stage B's
  7-day forced-`next` window is the dress rehearsal that makes this
  safe; do not start Stage C until it passes clean.

---

## 5. Session log

**May 2026 — Stage A (original `wKzyC` branch, landed on main):**
ported the 6 `/features/*` marketing pages into `app/next/features/*`,
dropped `/features` from the proxy's tree-agnostic list, added the
`features-parity` anon regression spec, wrote this plan, and flipped
the `profiles.ui_version` column default to `next` — migration
`20260521000000`, applied directly to production 2026-05-21. At
apply time all 66 prod users were already on `next`; the prior
`legacy` default would have regressed the next signup.

**June 2026 — v2 restart (this branch, `v2-wKzyC`):** ran the route-
parity and `/api/*` keep-list audits afresh against current main.
Findings:
- Legacy page count unchanged at 41. No new legacy pages added.
- Surface `/api/*` count is now 101 handlers (was ~100 in May).
  Keep-list moved from 12 → 15 routes; deletion count from 88 → 86.
  New keep-promotions: `/api/admin/questions-v2/generate` (new
  `GenerateAlternate.jsx`), `/api/teacher/student/[id]/upload-bluebook`
  (now also called by `BluebookBatchInteractive.tsx`), and
  `/api/admin/sync-lessonworks` (Vercel cron in `vercel.json` —
  missed in May since no in-repo `fetch` exists).
- New keep-demotion: `/api/billing/status` (next-tree billing page
  explicitly stopped polling it; legacy is its only caller).
- New drop: `/dashboard/recommendations` (no next-tree equivalent;
  surface retired).
- New redirect set noted: ~13 legacy URLs that rename in the next
  tree (`/teacher/*` → `/tutor/*`, `/practice-test*` → `/practice/test*`,
  etc.) get 308 redirects added to `proxy.js` in step C-3 so
  bookmarks and emailed attempt links don't break.

Lesson-pack and weak-drill features that shipped to main use Server
Actions rather than `/api/*` handlers — consistent with §3 of the
architecture plan and a healthy signal that new feature work
reduces API surface rather than growing it.

**June 2026 — Stage C complete (this branch).** Four commits per
the audit-refresh inventory. Net diff: ~41,000 lines removed, 292
files renamed, 50% reduction in `proxy.js`, single-tree layout.

**Followups not part of this branch:**
- `tests/e2e/helpers/fixtures.ts` references /api/* routes that
  were deleted in C-2 (admin/users, dashboard, teacher/*, billing/
  status, etc.). The negative-test specs that iterate those arrays
  will fail loudly in CI. The fix is not a simple route swap —
  most of the surface that moved to Server Actions doesn't have a
  GET-able equivalent to test with `request.get(url)`. The auth-
  matrix testing strategy needs a redesign that leans more on
  page-level role redirects (which still exist) and less on
  /api/* GET probes.
- `app/globals.css` (8235 lines) carries 8k lines of legacy
  component CSS that no surviving element uses. For overlapping
  token names (`--bg`, `--card`, etc.), `next-tokens.css` wins
  because of import order, so functionally it's harmless. Trim to
  baseline (html/body, *{box-sizing}, a{} reset) in a polish pass.
- ~30 `*.module.css` files have doc-comment headers that still
  reference `[data-tree="next"]` as the token source. Selector is
  now `:root`. Cosmetic only.
- Stale doc comments in app and lib that reference the old
  `app/next/...` paths (the imports themselves were swept en
  masse).

**Pending owner sign-off:** None. Stage D destructive work is done.
The two remaining items (Playwright dual-tree mode, audit-metrics
re-run) are non-destructive cosmetic followups.

**June 2026 — Stage D mostly complete (across two branches,
`claude/stage-e4-consolidate-attempts-question-id` and
`claude/archive-v1-practice-test-module-items`, both merged).**

Stage E-4 series + follow-ups normalized `attempts.question_id` to
v2 across all 19,670 rows, audited the 11 v1-referencing DB
functions (dropped 8, simplified 3 to drop the v1↔v2 union join),
cleaned up the stale concept-tags translation in 5 read paths and
fixed the latent tag-search bug it was masking, archived the
v1 question + answer + assignment + practice-test clusters to
`_legacy` (17 tables total when combined with prior archives),
backfilled the 140 v1 ids still in `practice_sessions.question_ids`,
and dropped the dead `questions_current` view. The
`expandToAttemptIds` and `resolveQuestionV2Meta` helpers in
`lib/practice/weak-queue.js` were simplified to drop the
now-unnecessary `question_id_map` walks. After this work the
`public` schema has zero v1 question/test/assignment surface; the
13 v1 tables in `_legacy` (plus 4 already-archived from earlier
work) hold the historical artifact. Final drop on `_legacy` is the
90-day-hold followup; the timer starts on the most recent archive
migration's apply date.

Scope expanded beyond the original Stage D bullet list to also
cover `question_id_map`, the v1 `practice_test_*` cluster (which
mirrored `practice_tests_v2` / `practice_test_modules_v2` /
`practice_test_module_items_v2` with no sync trigger and was kept
parity manually until being repointed in this work), and three of
the `lesson_*` artifacts. The wider scope was discovered during
the audit phase and absorbed since the work was already trivially
adjacent.
