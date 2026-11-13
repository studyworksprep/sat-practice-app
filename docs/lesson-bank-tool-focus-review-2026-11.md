# Lesson bank tool-focus review

> **Status: Historical.** Local revision and verification completed 2026-11-13. These files have not been imported into production.

Baseline: `06052f06ec64a6110f5ca2ae9c0ebd864fe174cf` on `main`, verified against the GitHub remote after PR #485 merged. Work is on `codex/lesson-bank-tool-focus`.

Reviewed all 44 lessons beyond the newly revised Equivalent Expressions by Graphing lesson. Revised 39 and preserved their exact previous specifications in `lesson-template-specs/archive/tool-focus-2026-11/`. Five already met the guidelines and remain byte-identical. Equivalent Expressions by Graphing is excluded and also remains byte-identical.

## Applied changes

- Moved 28 ungraded openings' complete question stems and A–D choices into their question cards. Brief attempt instructions remain separate. Graded returns use stimulus-only prompts and show each choice once as an answer button.
- Generalized transitions before function, regression, probability, percent, and contextual-equation variations. Put the example's definitions, values, restrictions, and task with its actual activity.
- Removed redundant definition/prediction checks and manual substitution, decimal-conversion, and scaling detours that the calculator workflow does not require. Replaced two abstract checks with applied decisions about regression form and eliminating a slider mismatch.
- Used supplied function definitions directly in custom regression and showed calculator commands/readouts in feedback. A one-row percent-of activity replaces the decimal-multiplication comparison, with a matching interface figure.
- Kept altitude diagrams with geometry applications, the earlier museum sentence with its colon explanation, and the full disputed answer with the roof-coating follow-up.
- Removed the preloaded fitted equation and reflected point from the quadratic symmetry exploration. The student now receives the axis, vertex, and known point and can add the reflection.

The **Subject–Verb Agreement shortcut and every eligibility check remain intact**, as explicitly requested: complete phrases, exclusive he/they classification, and a three-to-one split. Reading evidence reasoning, probability selection groups, geometry relationships, inequality sign reversal, and exact slope/proportion work remain wherever they are the method or necessary prerequisites. This pass does not remove a lesson's actual tool merely because it involves conceptual reasoning.

The authoring guide now lists the direct percent-of figure. The revision guidelines explicitly cover persistent geometry diagrams, quoting choices in follow-up questions, and seeding only given information on discovery activities.

## Coverage

“Layout” includes keeping the opening question and choices together. “Content” includes instruction, feedback, sequence, activity, or context changes beyond that opening layout.

| Lesson | Blocks before → after | Review result | Lint warnings |
| --- | ---: | --- | ---: |
| [Advanced Factoring: Non-Monic Trinomials and Cubes](lesson-template-specs/advanced-factoring-non-monic-trinomials-and-cubes.json) | 33 → 33 | Layout | 4 |
| [Solve SAT Boundaries Questions in the Fastest Order](lesson-template-specs/boundaries-punctuation-order.json) | 48 → 48 | Content and layout | 3 |
| [Place Transition Words by Logic](lesson-template-specs/boundaries-transition-word-placement-and-logic.json) | 39 → 39 | Layout | 1 |
| [Find the Point: Central Ideas and Details](lesson-template-specs/central-ideas-and-details-find-the-point.json) | 26 → 26 | Layout | 2 |
| [Circle Geometric Relationships](lesson-template-specs/circle-geometric-relationships.json) | 28 → 28 | Already compliant | 0 |
| [Circle Graphs](lesson-template-specs/circle-graphs.json) | 32 → 32 | Already compliant | 1 |
| [Circle Toolkit: Measure, Arcs, and Equations](lesson-template-specs/circle-toolkit-measure-arcs-and-equations.json) | 44 → 44 | Layout | 3 |
| [CLEAR the Claim: Command of Evidence](lesson-template-specs/command-of-evidence-clear-the-claim.json) | 36 → 36 | Layout | 3 |
| [Keep the Voices Straight: Cross-Text Connections](lesson-template-specs/cross-text-connections-keep-the-voices-straight.json) | 26 → 26 | Layout | 3 |
| [Find Missing Constants with Custom Regression](lesson-template-specs/custom-regression-from-data.json) | 30 → 30 | Content | 0 |
| [Use Desmos Lists and List Tools](lesson-template-specs/desmos-list-tools.json) | 34 → 32 | Content | 4 |
| [Factor Out the Greatest Common Factor](lesson-template-specs/factor-out-greatest-common-factor.json) | 34 → 34 | Content and layout | 1 |
| [Factor Polynomials: Trinomials and Difference of Squares](lesson-template-specs/factoring-polynomials-gcf-trinomials-difference-of-squares.json) | 35 → 35 | Layout | 2 |
| [Find Missing Constants in Equivalent Expressions with Regression](lesson-template-specs/find-missing-constants-in-equivalent-expressions-with-regression.json) | 32 → 32 | Content | 1 |
| [Find the Equation with My Numbers](lesson-template-specs/find-the-equation-with-my-numbers.json) | 33 → 33 | Content and layout | 3 |
| [Functions and Function Notation on the SAT](lesson-template-specs/functions-and-function-notation.json) | 32 → 31 | Content and layout | 1 |
| [Good Cop / Bad Cop: Prove Every Reading Answer](lesson-template-specs/good-cop-bad-cop-reading-answers.json) | 42 → 42 | Content and layout | 1 |
| [Inference Questions: Make the Smallest Supported Leap](lesson-template-specs/inference-minimum-supported-conclusion.json) | 27 → 26 | Content and layout | 2 |
| [Initial Modifiers: Match the Noun After the Comma](lesson-template-specs/initial-modifiers-match-the-noun-after-the-comma.json) | 32 → 32 | Layout | 1 |
| [Use My Numbers to Make Abstract SAT Problems Concrete](lesson-template-specs/my-numbers-strategy.json) | 32 → 32 | Layout | 2 |
| [Solve Percent and Percent Change Problems with Desmos](lesson-template-specs/percentages-and-percent-change.json) | 42 → 39 | Content | 2 |
| [Find Probability from Tables: Favorable over Total](lesson-template-specs/probability-from-tables-favorable-over-total.json) | 33 → 33 | Content | 1 |
| [Rates in Two-Variable Equations: Read the Units](lesson-template-specs/rates-and-units-in-two-variable-equations.json) | 27 → 27 | Content and layout | 2 |
| [Process and Pre-Answer Reading Comprehension Questions](lesson-template-specs/reading-comprehension-process-and-pre-answer.json) | 39 → 39 | Content and layout | 1 |
| [Rhetorical Synthesis: Let the Goal Lead](lesson-template-specs/rhetorical-synthesis-goal-first.json) | 26 → 26 | Layout | 2 |
| [Right Triangle Trigonometry with SOHCAHTOA](lesson-template-specs/right-triangle-trigonometry-sohcahtoa.json) | 34 → 34 | Layout | 3 |
| [Use Scale Factors with Similar Shapes](lesson-template-specs/scale-factor-and-similar-shapes.json) | 40 → 40 | Layout | 3 |
| [Recognize and Use Similar Triangles](lesson-template-specs/similar-triangles.json) | 33 → 32 | Content | 2 |
| [Solve Multiple Equations With List Regression](lesson-template-specs/solve-multiple-equations-with-list-regression.json) | 33 → 31 | Content | 2 |
| [Solve Multiple Percent Equations with List Regression](lesson-template-specs/solve-multiple-percent-equations-with-list-regression.json) | 29 → 29 | Content | 1 |
| [Solving Equations by Graphing](lesson-template-specs/solving-equations-by-graphing-x-intercepts.json) | 30 → 30 | Already compliant | 1 |
| [Solving Equations with Regression](lesson-template-specs/solving-equations-with-regression.json) | 31 → 31 | Content | 2 |
| [Solve Linear Inequalities: Boundary and Test](lesson-template-specs/solving-linear-inequalities-boundary-and-test.json) | 25 → 25 | Already compliant | 1 |
| [Solve Systems of Equations by Graphing in Desmos](lesson-template-specs/solving-systems-of-equations-by-graphing.json) | 27 → 25 | Content | 1 |
| [Special Right Triangles: Recognize, Scale, Solve](lesson-template-specs/special-right-triangles-45-45-90-and-30-60-90.json) | 35 → 35 | Layout | 3 |
| [Special Systems: No Solution and Infinitely Many Solutions](lesson-template-specs/special-systems-no-solution-and-infinitely-many.json) | 32 → 32 | Already compliant | 5 |
| [Understand and Use Standard Deviation](lesson-template-specs/standard-deviation.json) | 33 → 33 | Layout | 3 |
| [Find a Standard Regression Equation from Data](lesson-template-specs/standard-regression-from-data.json) | 34 → 34 | Content | 0 |
| [Solve Subject–Verb Agreement with the Odd-One-Out Trick](lesson-template-specs/subject-verb-agreement-odd-one-out.json) | 40 → 38 | Content and layout | 2 |
| [Reason Through SAT Survey Questions](lesson-template-specs/surveys-sampling-and-margin-of-error.json) | 35 → 35 | Layout | 3 |
| [Testing Equivalent Expressions with Desmos Sliders](lesson-template-specs/testing-equivalent-expressions-with-desmos-sliders.json) | 19 → 19 | Content and layout | 1 |
| [Name the Job: Text Structure and Purpose](lesson-template-specs/text-structure-and-purpose-name-the-job.json) | 27 → 27 | Layout | 2 |
| [Bracket the Pivot: Choose Precise SAT Transitions](lesson-template-specs/transitions-bracket-the-pivot.json) | 26 → 26 | Layout | 2 |
| [Solve Words in Context with Read, Predict, Match](lesson-template-specs/words-in-context-read-predict-match.json) | 36 → 36 | Layout | 2 |

## Unchanged lessons

- **Circle Geometric Relationships**: Relationships and calculations are the tool; each worked example gives its data and task.
- **Circle Graphs**: Direct graphing, center/radius reading, and coordinate variations already follow the standard. Standard-form work is needed to answer equation questions.
- **Solving Equations by Graphing**: User-approved reference sequence already meets the standard.
- **Solve Linear Inequalities: Boundary and Test**: Boundary and Test includes substitution and sign reversal as essential steps, not a competing algebra detour.
- **Special Systems: No Solution and Infinitely Many Solutions**: Same Slope Then Intercept and coefficient proportions are the taught tools; their exact algebra is required to find constants.

## Preservation and assessment identity

All 39 archives are exact copies of the baseline specifications, not regenerated JSON. Retained checks and calculator activities keep their IDs. Three substantively different assessments have new identities:

| Previous ID | Replacement ID | Reason |
| --- | --- | --- |
| `percent_of_input` | `enter_percent_of_amount` | One direct percent-of command replaces a two-form comparison |
| `boundary_check` | `choose_required_regression_form` | Choose a workflow for the requested form rather than recall model categories |
| `check_2` (Sliders) | `slider_mismatch_action` | Decide what to do with a mismatch rather than define equivalence |

The 17 removed block identities include those three replacements; there are 14 fewer blocks overall (1,471 → 1,457). Original questions, answers, and retired checks remain in the archives. This work changes source content only and makes no database, assignment, or student-history writes.

## Verification

- All 45 active specs compile and validate; all 39 archived specs also compile and validate. The skill's per-file validator passes for every revised lesson with zero compiler or validator warnings.
- All 233 existing lesson unit tests pass.
- Browser rendering covers every revised slide at 1280px and 390px: **2,560 views**, with no page errors, document overflow, broken figures, or MathJax errors. Representative screenshots were visually reviewed for complete openings, the direct percent interface, and persistent geometry diagrams.
- Every revised lesson's return-to-opening check accepts the key after a wrong-answer retry, with no duplicated static choices. Full student previews advance past the ungraded opening; full tutor previews permit skipping questions.
- Live Desmos verification rejects a wrong percent base and an extra expression row, accepts the one-row percent command and displays 28, and reveals the worked solution. Function-definition regression rejects a wrong definition, accepts `y_1~f(x_1)-c` with c = 8, and continues to accept the previously valid expanded equivalent. The symmetry activity seeds no answer. Both replacement multiple-choice questions retry on all three distractors, accept the key, and reveal their worked solutions.
- The local preview uses the repository's unchanged lesson UI/compiler/validator code with compiled local JSON. It does not exercise authenticated database import or production persistence.

### Lint decisions

The corpus has **86 warnings** versus 84 at baseline: 58 text-run, 24 check-run, three retrieval-wording heuristics, and one term-echo heuristic. There are no new answer-quality warnings. The four newly located pacing warnings were reviewed individually:

- Inference: removing a definition quiz leaves three short cards for the cue, process, and worked soundbite. These have different instructional jobs.
- Similar Triangles: removing the ranking table leaves the proportion routine and two short worked models together. Keep the useful examples without padding.
- List Regression: restrictions, the power variation, and its worked setup form a deliberate introduction-to-application sequence.
- Subject–Verb Agreement: the complete eligibility check is followed by singular and plural applications. Removing redundant setup cards deliberately groups these checks.

The pre-existing three retrieval heuristics concern ordinary SAT application questions in Central Ideas, Cross-Text Connections, and Text Structure; retain their passage-specific distractors. The term-echo warning remains on the unchanged Special Systems question that explicitly asks for the no-solution condition. Other pacing warnings reflect the existing purposeful explanation and independent-practice groups; they were not padded with extra slides merely to silence the heuristic.

### Random reference models

Selected during this run after syncing main and reviewed for structure, pacing, feedback, and calculator presentation:

- `standard-deviation.json`
- `solving-systems-of-equations-by-graphing.json`
- `solving-linear-inequalities-boundary-and-test.json`

These models informed the review; each lesson retained its own narrowly defined tool and relevant variations.
