# Third optional lesson-quality batch — implemented

> **Status: Historical.** Completed November 13, 2026.

Four fresh independent questions were added to the requested lessons. All existing questions, explanations, diagrams, and block identities remain unchanged. Each new question is one-shot, has a new stable ID, supplies no worked setup before the attempt, and appears before the existing sign-off.

| Lesson | Added independent assessment | Cards before → after |
| --- | --- | --- |
| [Custom Regression](https://studyworks.io/tutor/lessons/fc183eea-36c4-4a33-8eaf-3fede3806eaa/preview) | Fit two constants in a specified shifted quadratic from three function conditions, then report a combination of both constants. | 30 → 31 |
| [Systems by Graphing](https://studyworks.io/tutor/lessons/44b8a858-d657-4b6d-b780-c5850e266b37/preview) | Graph a fresh parabola/line system and select the greatest y-coordinate across both intersections. That value occurs at the left intersection, so choosing the rightmost point does not work. | 25 → 26 |
| [Trigonometry](https://studyworks.io/tutor/lessons/cd9e2655-3adc-4b36-9d75-a31bbd0aaaba/preview) | Choose an exact expression for a missing hypotenuse from a given adjacent leg and angle. A new labeled diagram shows the givens and unknown without naming the side roles or printing the solved length. | 34 → 35 |
| [Name the Job](https://studyworks.io/tutor/lessons/c29f6421-47f1-4b83-866e-9c3beb944e8d/preview) | Identify the overall structure of a fresh original passage: limitation → comparison illustrating the limitation → a recommendation to supplement the original measure. | 27 → 28 |

These are newly authored lesson questions, not questions represented as records from the existing content bank. They measure taught variations; they do not introduce a new strategy or reinstate any criticism withdrawn in the audit recheck.

## Verification

- All four specifications compile and pass the lesson validator with zero errors and warnings. Their compiled content exactly matches the intended saved blocks.
- Twenty numeric response cases cover accepted equivalent forms and plausible wrong values. Independent exact arithmetic shows the regression conditions determine p=3 and q=5 uniquely; p+2q=13. Live Desmos fitted those constants, displayed R²=1, and returned 13.
- The new system reduces to `(x+1)(x−4)=0`, giving every intersection: (−1,8) and (4,3). Both coordinates were read in the live graph. The maximum y-value is 8; 4, 3, and −1 represent different requested quantities.
- The trig diagram's right angle and 32° acute angle were checked geometrically. Only `14/cos(32°)` among the four choices satisfies the given adjacent/hypotenuse relationship. Distractors change the side role or use multiplication where division is needed.
- The reading item and all distractors were reviewed against the full passage. The decisive wording is “alongside the average”: the recommendation supplements the original measure. Other choices change the sequence, replace that measure, or invent a causal explanation and operational change. The passage contains 85 words; with its question it fits the repository's observed text-structure stem profile.
- Every slide was visited at laptop and mobile widths: 120 slides at each width, 240 captures. All images loaded and no page-width overflow was detected. The four new mobile questions were visually reviewed, including calculator questions with the calculator hidden. Calculator Reset, table entry, fitting, and intersection selection were exercised in live tutor preview. Preview shows answer feedback by design and records no student answers.
- Pacing lint warnings were reviewed. The short consecutive checks are intentional independent practice sets; previous explanation runs remain. The linter also applies a retrieval-distractor heuristic to Name the Job's last overall-structure question. This is an application to a passage, not process recall; the distractors were retained for the specific textual errors documented above.
- The complete 46-lesson comparison confirms that the other 42 lesson records are unchanged. All 1,510 pre-batch block IDs and content objects remain intact, including the earlier batches. Only the four sign-offs moved down one position. Four new questions bring the bank to 1,514 blocks. Student progress (49 rows), topics, techniques, assignments, curriculum placement, publication status, and visibility are unchanged.

## Source and recovery

The updated specifications are:

- `docs/lesson-template-specs/custom-regression-from-data.json`
- `docs/lesson-template-specs/solving-systems-of-equations-by-graphing.json`
- `docs/lesson-template-specs/right-triangle-trigonometry-sohcahtoa.json`
- `docs/lesson-template-specs/text-structure-and-purpose-name-the-job.json`

Exact previous live specifications are preserved under `docs/lesson-template-specs/archive/quality-third-batch-2026-11-13/`. The earlier Trigonometry diagrams are preserved in the new canonical specification.

Work used a clean checkout matching current remote main, commit `52c625499a61bb70e20b79d0a38f5e3fe5a23e4e`. Git fetching was limited by read-only metadata in the original checkout and unavailable DNS in the separate checkout. The GitHub connector independently confirmed the current main commit, which exactly matched the checked-out object. The previously read authoring and revision guidelines are unchanged at that commit. Existing working files were protected.

Three model specifications were selected randomly and read:

- `docs/lesson-template-specs/factoring-polynomials-gcf-trinomials-difference-of-squares.json`
- `docs/lesson-template-specs/rhetorical-synthesis-goal-first.json`
- `docs/lesson-template-specs/factor-out-greatest-common-factor.json`

The [batch source branch](https://github.com/studyworksprep/sat-practice-app/tree/codex/lesson-quality-third-batch-20261113-bf5d) preserves the four updated specifications, their archives, and this record. The original diagram is in `public/images/lesson-quality-third-batch/`, served from immutable asset commit [a17c99b1](https://github.com/studyworksprep/sat-practice-app/commit/a17c99b188acc26d41f19801d9a51968c643f4a2). No application deployment is required for these saved-content changes.

Local review and recovery materials are in `content/lesson-repairs/2026-11-13-quality-third-batch/`: before/after snapshots, guarded SQL, answer-key analysis, validator and lint reports, diagram source, preview evidence, and publication record.

Other optional recommendations, local-only drafts, and question-bank items remain untouched.
