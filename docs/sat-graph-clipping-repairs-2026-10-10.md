# SAT graph clipping repairs — October 10, 2026

**Status: Historical.** Production repair and code verification record for October 10, 2026.

117 published SAT questions had graph clipping references whose definitions did not reach the browser. In 106 questions, the saved math render cache used lowercase `clippath`; the sanitizer allows the required case-sensitive SVG name `clipPath`. In 11 questions, the clipping wrappers were absent from the saved source itself.

The production repairs restored cache tag capitalization and restored 27 missing clipping wrappers across those 11 questions. Fresh official College Board records were matched to each question. Every replacement rectangle matched the geometry already retained in the bank, so the existing rectangle was wrapped with its official clipping definition. Four additional raw-source capitalization cases within the 106-question group were corrected.

Graph coordinates, paths, labels, option order, canonical answers, and question identities were preserved. Existing student and practice-test results were not regraded or rewritten.

The code change prevents recurrence: shared math rendering restores the SVG `clipPath` name after the MathJax HTML adaptor lowercases it. Question sanitization also canonicalizes older lowercase clipping tags before applying its existing allowlist and attribute filtering. Script elements, event handlers, and unsafe URLs remain filtered.

## Verification

- All 117 database records matched the exact prepared content and cache hashes plus complete metadata readback.
- 234 desktop/mobile browser checks passed; every graph clipping reference resolved to its intended SVG clipping rectangle, with no missing images or unprocessed math.
- All 117 canonical answers were preserved.
- 15 prior-content snapshots and 13 pre-existing snapshots were verified.
- 882 existing student attempts, 394 practice-test item attempts, and 48 test memberships were unchanged.
- 613 unit tests, TypeScript checking, and lint of the affected files passed.

The production data repairs are applied. The preventive code changes require the normal PR merge and deployment. Mobile layout and missing-emphasis findings remain a separate workstream.

Repair evidence, before/after records, the guarded transaction, fresh official records, and browser checks are retained in the local `tmp/sat-bank-clipping-repairs-2026-10-10/` directory. This evidence contains full question snapshots and is not included in the code PR.
