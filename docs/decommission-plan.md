# Legacy tree decommission plan

The working checklist for retiring the legacy `app/` route tree and
making `app/next/` the sole framework. This is the concrete,
current-state companion to `docs/architecture-plan.md` §4 Phase 6 —
that section is the design intent; this file is what we actually do,
in order, with the audit that justifies each step.

_Started May 2026, branch `claude/legacy-tree-decommission-wKzyC`._

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

Every legacy page route was matched to a next-tree equivalent. ~35
routes have full parity. The gaps and their resolutions:

| Legacy route(s) | Decision | Status |
|---|---|---|
| `/features/*` (3 decks + 3 demo pages) | Port into the next tree | **Done — Stage A** |
| `/bugs` (bug-report page) | Drop — bug reporting retired | Deleted in Stage C |
| `/admin/bulk-reocr` | Drop — architecture plan never targeted it for port | Deleted in Stage C |
| `/act-practice/import` | Already ported — ACT import moved to `app/next/(admin)/admin/act/imports/*` | No action |
| `/account` (bare) | Not a real route (legacy only had `/account/billing`, which is ported) | No action |

`/bugs` is referenced only by the legacy `components/AdminDashboard.js`
— no next-tree code links to it, so dropping it needs no Stage A
work. It is deleted with the rest of the legacy tree in Stage C.

---

## 3. The decommission stages

### Stage A — Close parity gaps (non-destructive) — IN PROGRESS

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

### Stage B — Verify the Phase 6 precondition (no code)

Owner must confirm before Stage C — none of this is verifiable from
the repo:

- [ ] 100% of production users effectively on `next` (no account
      still carrying `ui_version='legacy'`), held for 30+ days.
- [ ] `feature_flags.force_ui_version='next'` for a 7-day window with
      the legacy tree unreachable even by direct URL.
- [ ] Dual-tree Playwright CI green for the full window.
- [ ] `select count(*) from desmos_saved_states` — if non-zero,
      schedule the v1→v2 `question_id` migration noted in
      `docs/cutover-runbook.md` before legacy reads disappear.

### Stage C — Delete the legacy tree (destructive — needs sign-off)

- [ ] Delete legacy route dirs: `app/practice`, `app/act-practice`,
      `app/practice-test`, `app/dashboard`, `app/teacher`,
      `app/teachers`, `app/review`, `app/assignments`, `app/learn`,
      `app/flashcards`, `app/account`, `app/admin`, `app/login`,
      `app/subscribe`, `app/bugs`, `app/features`.
- [ ] Delete legacy-only `components/` (`AdminDashboard.js`,
      `NavBar.js`, `FeatureSlideshow.js` once relocated, etc.) and
      `lib/practiceSessionStorage.js` (legacy-only — 6 importers, all
      legacy).
- [ ] Delete the ~88 legacy-only `/api/*` route handlers. **Keep**
      `/api/webhooks/*`, `/api/external/*`, `/api/public/*`,
      `/api/signup`, `/api/billing/*`, and `/api/practice-tests` —
      these have external callers or are still called by the next
      tree. Cross-check each `/api/*` segment against next-tree
      `fetch(` sites before deleting.
- [ ] Promote `app/next/*` to the route root (or keep the rewrite
      indefinitely — decide during Stage C). Simplify `proxy.js`:
      remove the tree resolver, the `x-ui-tree` header, the
      kill-switch read, `TREE_AGNOSTIC_PREFIXES`, `isTreeAgnostic`,
      `resolveUiTree`, `userTreeFromJwt`.
- [ ] Flip the next-tree design tokens from `[data-tree="next"]` back
      to `:root` and drop the wrapping `<div data-tree="next">` in
      `app/next/layout.js` (and the now-redundant root-layout NavBar
      gate).

### Stage D — Schema & flag cleanup (destructive — needs sign-off)

- [ ] Drop `profiles.ui_version` and the `force_ui_version`
      `feature_flags` row. Keep the `feature_flags` table.
- [ ] Remove dual-write/continuous-sync triggers feeding
      `assignments_v2` from the legacy `question_assignments` /
      `lesson_assignments` tables.
- [ ] Archive v1 question tables + legacy SAT assignment tables to a
      `_legacy` schema (`questions`, `question_versions`,
      `answer_options`, `correct_answers`, `question_taxonomy`,
      `question_assignments`, `question_assignment_students`).
      90-day hold, then drop.
- [ ] Retire `question_status`, its restored FK
      (`question_status_question_id_fkey`), and the
      `upsert_question_status_after_attempt` RPC — all legacy-only.
- [ ] Resolve the `question_concept_tags` v1-id FK noted in
      `docs/cutover-runbook.md` so concept tags can be written for
      v2-only questions.
- [ ] Remove the Playwright dual-tree mode; tests run once against
      the single tree.
- [ ] Re-run the `docs/architecture-plan.md` §2 audit metrics and
      confirm every §6 target is hit.
- [ ] Delete `docs/session-handoff.md` and `docs/cutover-runbook.md`
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

## 5. What this session did and did not do

**Did (Stage A, non-destructive):** ported the 6 `/features/*`
marketing pages into `app/next/features/*`, dropped `/features` from
the proxy's tree-agnostic list, added the `features-parity` anon
regression spec, and wrote this plan.

**Did not:** delete anything (Stages C/D are destructive and gated on
explicit sign-off + the Stage B precondition), and did not author the
5 §3.5 critical-flow tests — those need a running app against the dev
seed to write and validate real selectors, which a static session
cannot do. They remain a Stage A checklist item for whoever has the
seeded dev environment.
