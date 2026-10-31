# Student and tutor performance audit — 2026-10-29

> **Status: Historical.** Measurements and local changes verified on 2026-10-29.

The clearest shared costs were global MathJax/Desmos loading and serial
student-shell queries. Local fixes remove both SDKs from plain pages,
overlap independent reads, move welcome-email work after the response,
and remove an unnecessary tutor-roster aggregate query. Student hub
response times improve in this lab run. Tutor latency remains a separate
follow-up; this audit does not establish an aggregate tutor speedup.

## Method and limits

- Next.js 16.2.3 optimized production builds, Chromium, 1440×900 viewport,
  localhost:3100, with the checkout's `studyworks-dev` Supabase project
  (`ikzhizgsawzjpuuznfid`, us-east-2). These are local lab results, not
  production field measurements or a load test. No CPU/network throttling.
- Seeded student1 and teacher accounts, with the same existing local
  changes present in both builds. The local service-role key rejects demo
  sign-in; seeded password authentication works. No environment keys,
  deployed code, policies or database schemas were changed.
- Seventeen hub routes, two samples before and after: one browser-cache
  cold navigation and one warm reload. The comparison below uses the
  second sample. Additional repeat samples and flow checks are recorded
  separately. Server/database caches were not reset or controlled.
- TTFB measures navigation-to-response-start, not database execution.
  Content-ready measures a visible non-skeleton `main`, not interactivity.
  LCP and long tasks are observed for two seconds after that point; they
  are not field Core Web Vitals. INP and sustained concurrency were not
  measured. Cross-origin resources without Timing-Allow-Origin may report
  zero sizes; Desmos byte savings therefore cannot be quantified here.
- Timings vary by request. The first updated-build dashboard request was
  1,959 ms to content, compared with 993 ms in the initial run; server
  startup/cache state differs, so a cold-dashboard improvement is not
  established. Warm results below are observations, not percentile claims.
- A completed seed session streamed a redirect after DOMContentLoaded.
  Its preliminary runner samples are excluded. The reusable audit now
  validates the destination again after rendering to reject this case.

## Comparable warm-load observations

Milliseconds, rounded. Each row shows the second navigation per build.
Student/tutor identifiers in paths are shown as placeholders.

| Surface | TTFB before → after | Content before → after |
|---|---:|---:|
| Student dashboard | 872 → 548 | 967 → 910 |
| SAT practice picker | 669 → 508 | 772 → 544 |
| SAT test hub | 757 → 552 | 859 → 586 |
| ACT test hub | 699 → 510 | 800 → 541 |
| Practice history | 709 → 503 | 811 → 832 |
| Review hub | 700 → 580 | 1,047 → 951 |
| Student assignments | 588 → 445 | 692 → 478 |
| Lesson catalog | 562 → 384 | 660 → 417 |
| Notes index | 617 → 380 | 707 → 411 |
| Student statistics | 569 → 379 | 680 → 424 |
| Tutor dashboard | 429 → 456 | 837 → 811 |
| Tutor roster | 413 → 430 | 819 → 797 |
| Tutor student detail | 455 → 426 | 1,364 → 1,226 |
| Tutor student statistics | 428 → 485 | 876 → 961 |
| Tutor assignments | 464 → 447 | 995 → 903 |
| New assignment | 410 → 445 | 790 → 819 |
| Tutor cohort performance | 469 → 490 | 1,092 → 977 |

Across the ten student routes, the median of warm TTFBs falls from
684 to 505 ms (26%); median content readiness falls from 786 to 543 ms
(31%). Across seven tutor routes, median TTFB is 429 → 447 ms and
content readiness is 876 → 903 ms. The tutor changes reduce work and
asset loading, but these samples do not demonstrate lower aggregate
tutor latency. Individual rows moving either way should be rechecked
with production-sized fixtures and more samples.

Both SDK requests disappear on all seventeen plain hub routes. Median
known script body sizes fall from 527,661 to 323,055 bytes on student
hubs and 518,757 to 314,151 bytes on tutor hubs: roughly 200 KiB removed
per route, excluding opaque Desmos bytes. Cold-route median observed
long-task time falls from 102 ms to zero for student hubs and from
104 ms to zero for tutor hubs within the fixed observation window.

A separate three-sample repeat passed all 51 hub navigations with no
runtime errors and no MathJax/Desmos requests. Its 20 warm student
samples had median TTFB 504 ms and content readiness 540 ms. The 14
warm tutor samples had medians 421 ms and 855 ms, illustrating why the
small differences between tutor runs should not be treated as a
proven latency change.

Additional measurements use valid existing fixtures and the final
redirect guard. They have no comparable before-build baseline:

| Additional surface | Cold TTFB / content | Warm TTFB / content |
|---|---:|---:|
| Active SAT practice runner | 932 / 1,320 ms | 528 / 960 ms |
| Tutor live-session workspace | 907 / 2,377 ms | 405 / 1,577 ms |

## Local changes

| Change | Files | Effect |
|---|---|---|
| Remove global SDK loading/preloads | `app/layout.js`, `lib/ui/DesmosPanel.jsx` | Plain pages no longer fetch/execute MathJax or Desmos; calculator panels retain their existing Next Script loader |
| Shared on-demand math runtime | `lib/ui/mathjax-loader.ts`, `lib/ui/preview-effects.js`, `components/HtmlBlock.js`, both notes list renderers | One SDK download; waits for startup, serializes MathJax 3 typesetting, skips cancelled/detached renders, retries failed downloads |
| Parallel student shell + deferred email | `app/(student)/layout.js` | Tutor relationship, plan/intake and sidebar reads overlap; email check/send uses Next `after`, preserving the existing idempotent stamp |
| Reuse relationship probe | `lib/api/hasAssignedTutor.js` | Request-scoped React cache shares the layout/dashboard read; bounded existence query replaces an exact count |
| Parallel practice/review reads | Student practice picker and review hub | Taxonomy no longer precedes independent resume reads; review-queue sync overlaps unrelated reads, and SAT/ACT metadata plus flashcard counts overlap |
| Parallel roster reads | `app/(tutor)/tutor/roster/page.js` | Profiles, plan adherence and foundations start together; foundation progress retains its real syllabus dependency |
| Remove redundant aggregate | `app/(tutor)/tutor/performance/loader.js` | Derives roster IDs from the profiles already being loaded, instead of grouping all visible attempts through `student_practice_stats` just to obtain IDs |

The current `student_practice_stats` definition, also recorded in
`20261013100000_act_review_loop_and_stats.sql`, includes every visible
profile with role `student`, including inactive profiles. The replacement
uses the same predicate and profiles RLS. Authentication, subscription
checks and authorization boundaries remain in place. No cross-request
user-data cache or service-role read was added.

Math rendering preserves TeX and MathML inputs, the pinned 1.2355 scale,
and disabled font-height matching. Startup document-wide typesetting is
disabled so scoped renderers own DOM changes. This follows MathJax 3's
[asynchronous typesetting guidance](https://docs.mathjax.org/en/v3.2/web/typeset.html).
Email deferral uses the supported server-component
[`after` API](https://nextjs.org/docs/app/api-reference/functions/after),
and relationship deduplication uses
[React's per-request cache](https://react.dev/reference/react/cache).

## Remaining hotspots, in priority order

1. **Tutor workspace, statistics and cohort reports.** The live-session
   workspace takes 1,577 ms to show content in its warm sample. Its
   loader runs a second wave of prep-card queries after loading the
   last-session anchor; pipeline anchor-dependent work with unrelated
   first-wave reads where possible. Recorded dev statement families
   for `get_roster_skill_trend` average 219 ms (8 calls, max 524 ms),
   `get_student_extended_stats` 106 ms (21 calls, max 447 ms), and
   `get_student_coverage` 82 ms (1,029 calls, max 677 ms). Investigate
   authenticated EXPLAIN plans and repeated mastery-as-of calculations
   with a large roster before rewriting or caching these aggregates.
   Student detail/statistics also run `student_practice_stats` alongside
   other aggregates over the same attempt history. Consolidating those
   rollups is a more substantial follow-up than changing query order.
2. **ACT launchers and assignment builder scale with bank size.**
   `practice/start`'s ACT branch and `tutor/assignments/new` paginate
   question metadata for the whole live ACT bank and aggregate it in
   JavaScript; the ACT test hub reads form question identities. The dev
   bank has only nine visible ACT questions, so these results cannot
   validate production bank cost. Add an RLS-safe server-side taxonomy/
   form-summary query with the existing visibility/pool predicates;
   load only the selected assignment type where practical.
3. **Review history grows with the student.** The review hub and weak
   queues separately fetch complete SAT/ACT attempt histories, then
   resolve metadata in chunks. Share the attempt snapshot and eventually
   move the scoring summary to a bounded database query while retaining
   the existing recovery/cooldown semantics.
4. **Tutor assignments load before paginating.** The list fetches all
   outgoing assignments and junctions, then queries attempts per student
   before applying display pagination. Push filtering/pagination and
   summary work closer to the database; use stable pagination/chunking
   rather than relying on PostgREST's row cap for large histories.
5. **Runner loading has real sequential dependencies.** Session/module
   authorization, question lookup, reveal data and saved calculator
   state form several stages in `load-question.ts` and
   `load-test-question.ts`. Measure direct entry separately from the
   existing in-runner prefetch/navigation path; retain answer protection
   and session authorization when consolidating queries.
6. **Database policy/index follow-up.** Dev advisors report 74 auth/RLS
   init-plan findings, 104 multiple-policy findings and 40 uncovered
   foreign keys across the schema, plus duplicate
   `attempts_user_question_idx`/`idx_attempts_user_question` indexes.
   These are candidates, not proof that every advisory causes page
   latency. Validate relevant policies and query plans first. See the
   [RLS init-plan](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
   [foreign-key index](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
   and [duplicate-index](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index)
   remediation guides. No indexes or policies were changed by this audit.

Vercel functions are pinned to `pdx1`; the local database is us-east-2.
Confirm the deployed database's region and use deployed traces to
separate database execution from network round trips. Current local
measurements cannot establish the cause of a recent deployed-site
slowdown. Existing Sentry tracing is configured at 5% when enabled;
combine it with production page/role metrics and realistic roster and
attempt volumes for the next pass.

## Validation and reproduction

- Production builds before and after: passed, including build type checks.
- `npm run typecheck`: passed.
- `npm run test:unit`: 737 passed, including three new loader regressions
  for shared download/startup, serialized/cancelled typesetting and retry.
- Targeted ESLint: no errors; the existing HtmlBlock `imgMaxWidth` effect
  dependency warning remains. Code hygiene and TypeScript ratchet passed.
- Tutor page-access regression: 7 passed including auth setup; own student
  renders, unrelated student remains inaccessible, roster/dashboard render.
- All seventeen comparable routes rendered without recorded runtime errors.
- A subsequent 51-navigation repeat, valid active practice runner and
  tutor live-session workspace also passed with no runtime errors.
- Browser checks against the real CDN: concurrent TeX and MathML each
  produced math output with one SDK script and scale 1.2355. The seeded
  lesson loaded one Desmos script and rendered the calculator UI without
  runtime errors. The completed SAT score report rendered successfully.

Run `scripts/performance-audit.ts` with Node 22+ against an optimized local build with
prepared student/tutor storage states; see the
[runbook](runbook.md#investigating-slow-student-and-tutor-pages) for commands
and environment options. Detailed repeat output is saved under ignored
`tmp/performance/`, outside the directory Playwright clears when tests run.
The table above retains the original warm baseline/comparison summary.

## PR preparation — 2026-10-31

The performance changes were isolated onto current main (`ff4e8cd9`) for
review. The newer answer-choice math-fitting observer is retained: it
still observes pre-rendered math without loading the SDK and refreshes
once on-demand typesetting completes. Unrelated local ACT-import and
lesson-content changes are excluded.

The clean PR branch passes 725 unit tests, 14 browser math-layout tests,
13 content-normalization regressions, 23 migration guards, typecheck,
code hygiene, question-repair verification, lesson-spec validation and
authorization-matrix freshness. Full lint has no errors and retains the
repository's existing warnings. The earlier 737-test count above belongs
to the original October 29 checkout, which contained other local work.

The measurements remain a record of the October 29 checkout. Main has
since received the east-region migration; the old region observations
above do not describe the current deployed configuration. Deployment
performance after that migration has not been measured by this audit.

Final PR build recheck: the initial isolated Turbopack build passed,
but later rebuilds failed in Next's generated Google-font imports
(`next/font/google queries have exactly one entry`), including a retry
with a fresh `.next` directory. A webpack cross-check reached existing
CSS-module purity errors in untouched view-transition selectors. The PR
is a draft pending hosted CI confirmation; the checks listed above do
not imply that final local build verification is resolved.
