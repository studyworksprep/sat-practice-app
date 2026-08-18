# Lesson Suite Review (2026-08-18)

> **Status: Historical record.** An independent instructional-quality
> assessment of the 30 lesson specs in `docs/lesson-template-specs/`,
> accurate as of `main @ dca3e524` (2026-08-18). At that time 21 lessons
> were imported to production as drafts, 9 were not yet imported, and no
> student had started any lesson. Block numbers refer to the 1-based
> position in each spec's `blocks` array on that date; they will drift
> as lessons are edited. The fix list at the end was verified against
> source on the review date — check it off elsewhere rather than
> maintaining this document.

Prepared for the owner and the tutoring team's QA pass. It answers four
questions: (a) how well the lessons align with instructional best
practice for online learning; (b) how the lesson *system* should change
to serve students using it as their primary instruction; (c) which
individual lessons lag; (d) how to make the lessons more engaging and
give them personality. Method is at the end.

---

## At a glance

| | |
|---|---|
| Lesson specs | 30 (21 imported as drafts on 2026-08-11; 9 not yet imported) |
| Blocks | 1,103 (24–45 per lesson) |
| Knowledge checks | 509 — 507 retry-until-correct; the only exceptions are two `branching_question` blocks in Factoring Polynomials |
| Students who had started any lesson | 0 |
| Checks where the keyed answer is the strictly-longest choice | 38% (chance ≈ 25%); 88% of the "without looking back, which sequence…" retrieval checks; 79–91% in the four reading lessons |
| Images / videos / bank-question links | 15 images across 8 lessons; 0 videos; `question_link` used in 1 lesson |
| Lessons with a gated Desmos task | 6 of 30 (none in the two regression lessons or List Tools) |

---

## 1. The short version

This is a strong, unusually disciplined foundation. Every lesson follows
the same evidence-informed spine — explore before explain, define before
check, name a 3–5 step process, model it, vary one feature at a time,
transfer, retrieve — and the authoring guide behind it
(`docs/lesson-json-authoring-guide.md`) is better than most commercial
courseware specs. Math content is accurate: every keyed answer that was
read was recomputed, and one genuine keying defect was found in ~500
items. The reading-strategy lessons have the best explanations in the
corpus.

The gap between "well-built" and "works for a student learning alone" is
mostly systemic, not lesson-by-lesson, and clusters in five places:

1. **The checks can't fail.** 507 of 509 checks are retry-until-correct,
   and the runtime deliberately does not record wrong attempts
   (`lib/ui/LessonSlideshow.jsx`, the check `onSubmit` handler). A
   student can brute-force any four-choice check in ≤3 clicks, every
   completion banner reads "N of N checks correct", and tutors receive no
   signal about where a student struggled. For a tutor-supported student
   this is a nuisance; for a self-study student it removes the only
   feedback loop the system has.
2. **Item quality is the #1 content weakness, and it is measurable.** The
   keyed answer is the strictly-longest choice in 38% of checks; in the
   "Without looking back, which sequence…" retrieval checks it is 88% (28
   of 32); in the four reading lessons 79–91%. Distractors are frequently
   absurd ("Evaluate 3⁴", "It refers to the bees", "Whether the graph
   color is visible"), and hints in math lessons often state the
   computation. Net effect: many checks measure test-wiseness rather than
   the skill.
3. **The medium is under-used.** 15 images across 30 lessons; zero video;
   branching used in one lesson; one lesson uses `question_link`; only 6
   of 30 lessons contain a gated Desmos task — including none in the two
   regression lessons and the list-tools lesson, whose whole point is a
   Desmos workflow. Diagrams appear on one slide and are then referenced
   for the next 10–15 slides without being re-shown.
4. **Difficulty ramps stop short of the real test.** Transfer and practice
   items are mostly easier and shorter than Digital SAT items (one-line
   Boundaries sentences with bare-punctuation choices; "3p + p = 4p" as
   the My Numbers transfer; textbook drills rather than DSAT-shaped
   stems). A student can finish a lesson feeling fluent and still be
   surprised by the real item.
5. **The voice is competent and clean, but uniform to the point of
   anonymity.** Thirty lessons share one cadence ("Correct. … **Next, you
   will…**"), the same final-retrieval template, and almost no framing of
   *why this saves you time on test day*. The lessons with names — Good
   Cop / Bad Cop, My Numbers, CLEAR, Odd-One-Out — are noticeably more
   memorable; the rest could use the same treatment.

**Bottom line.** Ship-blocking issues are few and specific (see the fix
list). The high-leverage work is (1) two runtime changes — record retry
attempts and reveal a worked solution after two misses; (2) a
distractor/hint quality pass guided by a linter; (3) a house voice. Do
those and the same 30 lessons become materially better for solo learners
without rewriting them.

---

## 2. (a) Alignment with instructional best practice for online learning

Scored against the principles with the strongest evidence for self-paced
digital instruction (Mayer's multimedia principles, worked-example
fading, retrieval practice, spacing, elaborative feedback, generative
learning, variation theory) — and against the suite's own authoring
guide, which encodes most of them.

| Principle | Verdict | Evidence from the corpus |
|---|---|---|
| Segmenting — one idea per screen, short slides | **Strong** | Average text slide 50–87 words; longest single slide 154 words. Almost no walls of text. The suite's most consistent virtue. |
| Generative learning — explore/predict before the rule is named | **Strong** | Nearly every lesson opens with a "try one before learning the names" block. Standouts: My Numbers (engineered collision at w=4), x-Intercepts (click the graph first), Similar Triangles (match the angle before the rule). |
| Vary one feature at a time; contrast cases | **Strong** | x-Intercepts (variable swap → exact vs decimal → count solutions), Probability Tables (row → column → missing totals → no "given"), Rates & Units (coefficient → variable → term → total). |
| Coherence — no seductive details or off-objective content | **Strong** | Lessons are austere; almost nothing extraneous. If anything, over-corrected (see §5). |
| Worked examples with fading (model → guided → independent) | **Mixed** | Models are present everywhere. Fading is often too gentle: guided items are followed by "independent" items of the same shape and lower difficulty (My Numbers block 37; Surveys 29–31 are clones of earlier items; Custom Regression's transfer is fully scaffolded by its hint). |
| Retrieval practice | **Mixed** | Frequent checks (~40% of blocks). But the end-of-lesson retrieval check is a giveaway 88% of the time (keyed answer longest, distractors nonsensical), and there is no delayed/spaced retrieval anywhere in the system. |
| Immediate, actionable, elaborative feedback | **Mixed** | R&W explanations are excellent (Good Cop / Bad Cop dismantles every distractor). Math hints frequently hand over the answer ("Cross multiply: x²=18·8=144"; "Use the first row: −3=0²+5−c"). Retry mode never reveals a worked solution, so a stuck student loops. |
| Multimedia / dual coding — words with the relevant picture | **Weak** | 15 images in 30 lessons; 22 lessons have none. Diagram-dependent lessons (Similar Triangles, Trig, Scale Factor) show each figure once, then reference it for many slides. Regression lessons have no screenshot of a regression readout. Zero video. |
| Item validity — checks measure the skill, distractors mirror real errors | **Weak** | Length clue (38% overall, 88% on retrieval checks, 79–91% in reading lessons); extreme-word tell (Inference: 9% of keyed vs 61% of distractors contain all/every/only/must/proved); throwaway distractors in most lessons; "meta" checks that ask why the answer was right; one item with two correct answers (Scale Factor 39). |
| Transfer at target difficulty / authenticity to the DSAT | **Mixed** | Reading passages are authentic in length and style. Boundaries items use bare marks (";" ",") instead of DSAT "closed; the" chunks. Math practice items are mostly textbook drills; few DSAT-shaped stems ("Which expression is equivalent…", "best interpretation of…"). Only Command of Evidence links real bank questions. |
| Personalization — conversational "you" voice | **Mixed** | Consistently second-person and plain — good — but formulaic across all 30 (see §5). |
| Mastery gating & learner data | **Weak** | Retry gates exist but wrong attempts aren't stored; completion tally is always 100%; nothing adaptive; no first-try accuracy for tutors. |
| Prerequisite / curriculum linkage | **Weak** | Lessons name prerequisites in prose (Custom Regression → Standard Regression; Good Cop → Reading Process; My Numbers → Their Numbers / Find the Equation) but the catalog exposes no links, order, or time estimates. |

---

## 3. (b) How the lesson system should change for students using it as primary instruction

Ordered by leverage. The first group is small engineering changes that
improve all 30 lessons at once; the second is runtime capability; the
third is authoring standards and tooling.

### 3.1 Make the checks mean something (runtime — small changes, large effect)

- **Record every attempt.** Persist wrong attempts in
  `lesson_progress.check_answers` (e.g. `{selected, correct, attempts:[…]}`)
  instead of dropping them. Show the student a real end-of-lesson summary
  — *first-try 12/19; three checks took 3+ tries: blocks 14, 22, 31* —
  and give tutors a per-lesson heat-map. Today the retry gate is
  invisible to everyone but the student in the moment.
- **Escalate instead of looping.** After two wrong tries on a retry check,
  reveal a worked solution (a new optional `solution` field, or reuse
  `explanation`) and let the student continue, flagged. Unlimited retry
  with four choices is a brute-force invitation and, for a genuinely
  confused solo learner, a dead end.
- **Use one-shot mode for the final retrieval and transfer checks.** Those
  are the two places where a "you got it / you didn't" signal is worth
  more than a gate — and the only places where a first-attempt score
  would be honest.
- **Add a numeric-entry check type** (SPR-style: student types a
  number/expression; validate with the same equivalence logic Desmos
  blocks already use). About a third of the math checks are "what
  value…" questions where MC invites guessing and the real SAT would use
  a student-produced response.

### 3.2 Close the Desmos verification gap (runtime)

The interactive validator (`lib/lesson/desmos-interactive.mjs`) supports
`normalized`, `equivalent`, `state`, and `compare_expressions` — nothing
for tables, `~` regressions, lists, or fitted parameter values. So the
two regression lessons and List Tools *cannot* gate on the workflow they
teach, and currently teach it on the honor system with hints that give
the algebraic shortcut. Extend `state_rules` (or add a `regression` mode)
to check: a table exists with the expected rows; an expression uses `~`;
fitted parameters are within tolerance of expected values (Desmos's API
exposes regression parameters). This unlocks the strongest gating in
exactly the lessons that most need it.

### 3.3 Give diagrams and context persistence (runtime + authoring)

- **Repeat the figure on every slide that references it** — an authoring
  rule now; better, a runtime "pinned figure" (a block-level `figure_ref`
  the slideshow keeps visible in the calculator pane's slot) so geometry
  and data lessons don't require Previous×10.
- **Show estimated time and position** ("~25 min · 3 of 5 in Reading
  Foundations") in the catalog and lesson header. Forty-block lessons are
  30–45 minutes; solo learners need to plan for that.

### 3.4 Wire lessons into the rest of the platform (product)

- **Prerequisite links, enforced softly.** The foundations doc already
  plans a prerequisite graph; the lessons already state prerequisites in
  prose. Expose them ("Do *Standard Regression* first →") and surface a
  warning, not a lock.
- **Attach real practice.** Now that question-pattern tagging exists,
  every pattern lesson can end with 5–8 bank questions of its pattern
  (Command of Evidence proves the mechanism works). This is the single
  biggest step toward "transfer at real difficulty" and it needs no new
  authoring per lesson.
- **Delayed retrieval.** A 3-question re-check 48 hours after completion
  (surfaced on the student home page) converts one-shot exposure into
  durable learning; the checks already exist — reuse the lesson's
  transfer + retrieval items.
- **Use branching for placement.** `branching_question` is implemented
  and used in exactly one lesson (Factoring Polynomials, well). An
  "Already know this? Try the transfer item" branch at the top of
  foundational lessons respects strong students; a remediation branch on
  the model item helps weak ones. Both are cheap.

### 3.5 Authoring standards and a linter (tooling — pays back on every future lesson)

Extend `.agents/skills/create-sat-lesson/scripts/validate-lesson-spec.mjs`
(or add a sibling) with warnings for the patterns that recur across the
corpus:

- keyed choice ≥1.4× the mean length of the others, or the only choice
  containing the lesson's key term;
- a run of ≥3 checks with no explanation block between them;
- a hint that contains the keyed answer text or a full computation ("="
  followed by the numeric answer);
- a check whose prompt starts "Why is [the answer] correct" (meta-check
  filler);
- a check with two mathematically equivalent choices (fractions/ratios
  in lowest terms);
- images referenced by later prose ("the diagram", "the first figure")
  without an `<img>` on that slide;
- final retrieval check where three distractors share no words with the
  process — i.e. nonsense sequences.

And two guide changes: require at least one item per lesson at genuine
DSAT length/format (with the exact stem wording the SAT uses), and
require the "why this matters on test day" hook (see §5).

---

## 4. (c) Lesson-by-lesson

Ratings: **5** ship as-is · **4** minor polish · **3** solid, needs
targeted fixes · **2** significant rework · **1** broken. Twelve lessons
were read directly by the reviewer; eighteen by four parallel reviewers
working from the same rubric (all reports read and spot-verified —
including the two-correct-answers defect below). Distribution: fourteen
at 4, three at 3½, twelve at 3, one at 2, none at 5 or 1.

### 4.1 Math — Desmos strategy

| Lesson | Rating | One-line verdict | Highest-value fix |
|---|---|---|---|
| Solve Equations by Graphing: x-Intercepts | 4 | The reference model, deservedly: exploration first, gated Desmos transfer, 3-item practice set, retrieval. Voice is clinical. | Blocks 29 & 40 are near-duplicate method-choice checks with throwaway distractors ("Evaluate 3⁴", "Compute the mean") — merge and rebuild. |
| Solve Equations with Regression | 3 | Mechanics correct and limits taught honestly (one result ≠ one solution), but 42 blocks with repeated items (24≈28≈39) and every equation is mental-math trivial, so "why regression?" is never felt. | Add two authentic SAT items where regression pays; say how to type `~` on keyboard *and* keypad; add a readout screenshot; give block 25 an integer-solution system. |
| Find Missing Constants with Custom Regression | 3 | Genuinely useful power move (definitions like `a=10−b`), correctly sequenced — but a Desmos-fluency lesson with zero Desmos verification, no screenshot of a regression readout, and hints that give the algebraic shortcut. | Once the validator supports regressions, gate blocks 4, 15, 23, 33; until then add readout images and rewrite hints to point at the setup, not the equation. |
| Find a Standard Regression Equation from Data | 4 | Best Desmos pedagogy in the math set: student produces a regression before being told what one is; function-notation translation and the vertex-symmetry third point are real SAT leverage. | Move the Regression-button image from block 14 to block 2 (where the student first has to find it); block 31's hint (x=2) doesn't eliminate choice C — use x=5. |
| Solve Systems by Graphing in Desmos | 4 | Tight, Desmos-native, no drift; "enter as written" and "answer what was asked" are the two real student errors and both are drilled. | Stems in 11, 17, 20, 26 print the intersection, so the student never has to click and read after the gated entry. Delete them; add one off-window and one fractional intersection. |
| Special Systems: No / Infinitely Many Solutions | 4 | Three methods ordered by number of unknowns; explanations teach; algebra↔graph loop closes at 24–26. | Slider is oversold (A=1.9 and A=2 look parallel; the SAT's k=12/5 can't be pinned) — frame as estimate + confirm by slope; extend the a/b ratio trick (block 32) to the no-solution case, which the SAT tests more often. |
| Functions and Function Notation | 3 | Accurate and well-built, but two lessons wide (notation + regression-for-constants), and blocks 4–5 (is this a function?) are drift. | Block 14 prints "(3,6)" in the stem, defeating the exploration; split the regression half out or retitle; add "regression may return one of ± — check the stated condition." |
| Percent and Percent Change with Desmos | 3 | Best Desmos density in the suite (7 interactives) and error-mirroring distractors (17.6% wrong-base) — undercut by telegraphed answers (three items resolve to 75%; 24 copies 23), a five-slide text run (27–31), and no by-hand fallback. | Add one slide with part/whole, (New−Old)/Old and the multiplier form; vary the numbers; screenshot the "%→of" control the whole lesson depends on. |
| Use Desmos Lists and List Tools | **2** | A syntax manual, not an SAT tool: every example is `A=[2,3,4,5]`, no SAT item anchors it, and 21 checks are mostly trivial (block 24's hint: "the function name is the same as the statistic"; block 29's: the answer "was identified in the warning immediately before"). Never mentions `stdev` or the weighted-mean trick that make lists worth learning. | Rebuild around 3–4 real patterns (add k to every value → new mean/median; combine two groups; frequency-table mean via `total(x·f)/total(f)`; compare spreads with `stdev`) or fold into the data lessons. |
| Use My Numbers to Make Abstract Problems Concrete | 3½ | The best opening in the corpus — w=4 is engineered to produce a two-way tie so the retest rule is *experienced* before it's named. But the ramp is flat: the transfer (3p + p = 4p) is answerable without the strategy. | Replace practice/transfer items with real plug-in candidates: percent-of-percent, exponent rules, the (2x+y)/y form already modeled in block 21; break up the 12–16 text run. |
| Find the Equation with My Numbers | 4 | Mathematically airtight, real collision demo (29–31), hints point at the move. Overlong at 40 blocks; six checks are the same "what next" meta question. | Block 33 promises table-of-values items and shows none — add one plus an exponential/percent-change context; explanations should name the error each distractor encodes. |

### 4.2 Math — algebra content

| Lesson | Rating | One-line verdict | Highest-value fix |
|---|---|---|---|
| Factor Out the Greatest Common Factor | 4 | Impeccably sequenced (number part → variable part → combine); "equivalent ≠ fully factored" taught and re-tested; every key and distractor rebuilds correctly. | Block 9 renders "*outside factor [tab]imes every inside term*" — single-escaped `\times` in the JSON; transfer hints (32, 34) hand over the GCF; add one "which expression is equivalent" item. |
| Factor Polynomials: Trinomials & Difference of Squares | 4 | Both patterns derived from multiplication rather than asserted; the only lesson using branching; includes a real "Prime" answer choice. | Hints 13/25/32 give the pair/roots/first step; explain why 35-D fails ("10a+15b still shares 5"); a Desmos preset overlaying both forms would connect factoring to how the SAT actually uses it. |
| Advanced Factoring: Non-Monic Trinomials & Cubes | 3 | Clean algebra (every factorization verified) — but sum/difference of cubes is essentially absent from the Digital SAT, no SAT-shaped item appears, and the lesson never addresses "factor by hand vs. graph in Desmos," which sits oddly beside the platform's Desmos-first strategy. | Reposition (advanced/optional) or trim the cubes half; add DSAT-form items ("which is a factor of…", "for what k…"); add the when-to-graph decision. |

### 4.3 Math — geometry & data

| Lesson | Rating | One-line verdict | Highest-value fix |
|---|---|---|---|
| Recognize and Use Similar Triangles | 4 | Three genuinely necessary diagrams, math verified throughout, and the small/medium/large ranking trick for the altitude configuration is a real teaching asset. | Each figure appears on one slide but is referenced for 10–15 more ("in the first diagram", "the left triangle") — repeat them; consider splitting the altitude configuration into its own lesson. |
| Use Scale Factors with Similar Shapes | 3 | The area→√→linear→cube→volume "bridge" (25–28) is the clearest treatment of the hard case; but one broken item, the volume exploration (16–18) arrives *after* the rule is drilled (8, 11), and hints hand over the whole path. | **Block 39: choice D "18:15" equals the keyed "6:5" — two correct answers.** Reorder 16–18 before 8; replace 3–4 of the 35–42 drills with DSAT-shaped items (side increased 20%, radius tripled). |
| Right Triangle Trigonometry with SOHCAHTOA | 3 | Correct throughout, and rightly focused on translating vertex labels into a sketch — but the "sketch it" lesson shows no model sketch after block 2, opens calculator panes with no stated task (in default radians mode, tan(35) returns the wrong number — the very trap block 11 warns about), and the two most frequent DSAT trig items (numeric ratio from side lengths; sin x° = cos(90−x)°) are absent. | Add sketch images/presets at 13, 16, 19, 34 with explicit "Degrees mode, type 12tan(35)" instructions; split the radians section (23–27) out; add the missing item types. |
| Rates in Two-Variable Equations: Read the Units | 4 | Compact (24 blocks), accurate, built around the one insight students actually miss (block 8: the coefficient isn't always the rate); blocks 14–16 vary exactly one layer per check. | Transfer 21–22 is a solve, not an interpretation — replace with "what does 9r represent?"; swap absurd distractors (7C, 9C, 12C/D, 23A) for layer-confusion errors. |
| Probability from Tables: Favorable over Total | 4 | Accurate (all seven tables recompute), DSAT-like tables, and distractors that mirror the actual traps (grand-total, reversed restriction). | Delete the fraction-simplification filler (26); rewrite hints 16/24 to name the trap without the numbers; add one item where the restriction isn't phrased "given that." |
| Reason Through SAT Survey Questions | 3 | Statistically sound and gets the subtle points right (MOE ≠ bias; population size irrelevant; interval is plausible not guaranteed) — but it's four lessons in one, its "transfer" items are noun-swapped clones of earlier items, and every MOE item is a percent (the DSAT often reports a mean ± MOE). | Split (sampling/scope vs. margin of error) or cut to one tool; replace 29–31 with genuinely new forms including a mean-based MOE. |
| Understand and Use Standard Deviation | 4 | Well-targeted at what the SAT tests (conceptual comparison, add/remove/replace, shift invariance — no formula), dot-plot exploration, Desmos presets used to verify predictions. | Footnote that Desmos `stdev` is sample SD (1.58, 1) vs `stdevp` (1.41, 0.82) so a student who checks by hand isn't confused; practice items should use dot plots / frequency tables, which is how the DSAT presents them. |

### 4.4 Reading & Writing

| Lesson | Rating | One-line verdict | Highest-value fix |
|---|---|---|---|
| Solve Boundaries Questions in the Fastest Order | 4 | Sound routine, serial-semicolon exception, duplicate-choice elimination, good 5-item mixed practice. | Items don't look like the test: bare-mark choices (";" ",") instead of "closed; the / closed, the" chunks; one-line sentences vs. 40–80-word items; dashes rendered as `--` with an apology in block 24 (the em dash renders fine in 15 other lessons). |
| Place Transition Words by Logic | 3 | The right tool, well staged, and the "move it to the front of its own clause" trick (24–25) is genuinely useful. | Block 28 presents "; though, the field remained wet" as valid — clause-initial adverbial *though* isn't idiomatic and the SAT won't write it; keys like ", consequently;" are stilted; five three-clause items are binary because two distractors (", X," and "; X;") are never chosen. |
| Subject–Verb Agreement: Odd-One-Out | 4 | One tool, an explicit eligibility gate, every failure mode (fits both / neither / 2–2 / was–were) taught and checked, SAT-format sentences at the end. | Block 4 claims the pattern held "in every reviewed question"; since block 17 tells students not to read the sentence, hedge the wording and re-verify against newly released forms on a schedule. |
| Process and Pre-Answer Reading Comprehension | 3 | Accurate and well written, but a survey lesson (main idea + detail + function + inference), overlaps the Inference lesson (11–12 reuse its item; 15–19 its rule), and its central habit — form a target before seeing choices — can't be enforced: five blocks say "form a target" and Continue reveals the choices. | Convert 23, 26, 32, 34 into pre-choice checks ("which target best fits?") like 22 and 29 already do; cut 15–19; merge 24/25; fix 22's key ("traffic noise" isn't in the stem). |
| Good Cop / Bad Cop: Prove Every Reading Answer | 3½ | The best explanations in the corpus (every distractor dismantled), authentic passages, a memorable name, and block 13's "strong words aren't automatically wrong" is a sophisticated correction — yet nearly every check is passable by hunting for every/all/proved, and the follow-up "why is that choice wrong" checks (12, 20, 24, 29, 32, 38) have throwaway distractors ("It refers to the bees"). | Make two distractors per item hedged and half-right (as 23-B already is); rebuild or cut the follow-up checks; block 35 asks the student to "say the process" but is a text block — make it the retrieval check. |
| Inference: Make the Smallest Supported Leap | 3 | Structure and claims sound; the soundbite→combine method (7–10) is concrete; block 23 is a genuinely SAT-like item. But 61% of distractors contain always/every/only/must vs 9% of keys — three checks (12, 16, 18) are answerable without reading by picking the hedged choice, and their keys are restatements. | Rewrite one distractor per item as a hedged, plausible wrong (reversed comparison, wrong subject); apply Good Cop / Bad Cop (introduced in 21, never used) to the rooftop item or cut it; add one literary passage. |
| Words in Context: Read, Predict, Match | 3 | The subject–action–object test (13–15) with a reason each distractor fails is the strongest teaching in the R&W set; the "no match → second pass" move (19–20) is good. | Block 12's grammar test and block 16's mixed-part-of-speech choices (methodically / catalog / precise / organize) teach a test the DSAT never poses — WIC choices are always the same POS; block 7 hands the student "temporary" inside the sentence; most stems are one sentence where real items are 2–4. |
| CLEAR the Claim: Command of Evidence | 3½ | The most ambitious R&W lesson: a real bar-graph image, items modeled on hard DSAT patterns (species-aggregation trap, theory-vs-data bridge), and the only lesson that embeds real bank questions. | Five frameworks stacked (CLEAR + accurate/relevant/sufficient + title/axes/legend/data + six trap types + a 7-step routine) — trim to CLEAR and the three tests; the student never sees one full CLEAR run on a single item start to finish before practicing. |
| Rhetorical Synthesis: Let the Goal Lead | 4 | Tight (24 blocks), correct strategy (goal first is right), and "treat *and* as a two-part contract" is high-yield. | Block 14 ("why is that the answer") is filler; the fact-check example's distractors (19 C/D) are absurd; show one clean full-format item (notes → stem → choices) before the transfer. |

### 4.5 Lessons lagging furthest behind

Nothing is broken; the floor is high because the authoring guide is
good. But these are the ones where a solo student gets the least for
their time, in rough priority order:

1. **Use Desmos Lists and List Tools (2)** — the only lesson worth pulling
   from the catalog until rebuilt. It teaches syntax with no SAT question
   in sight and its checks are trivial to the point of being insulting.
   The rebuild is straightforward: three or four real data patterns, each
   solved once by hand and once with a list, ending in `stdev` and the
   frequency-table mean.
2. **Use Scale Factors with Similar Shapes (3, one keying defect)** — block
   39 has two correct answers; the volume "exploration" comes after the
   volume rule is drilled; hints give the path. Fix the item today,
   reorder this week.
3. **Right Triangle Trigonometry (3)** — the tool is "sketch it" and there
   are no sketches after the opener; the calculator panes open with no
   task and would give wrong numbers in default radians mode; the two most
   common DSAT trig items aren't in it.
4. **Advanced Factoring (3)** — not lagging in craft, lagging in yield:
   half the lesson (cubes) is content the Digital SAT essentially doesn't
   test, and none of it is framed as SAT items or connected to the
   when-to-graph decision the rest of the platform teaches.
5. **Custom Regression (3)** — the highest-value Desmos move in the suite,
   taught on the honor system with hints that make Desmos optional.
   Mostly a platform fix (regression validation) plus screenshots.
6. **Surveys (3), Reading Comprehension Process (3), Words in Context (3),
   Transitions (3), Percentages (3)** — each solid at the core with a
   specific, named defect above (four-in-one scope and cloned transfers; a
   pre-answer habit the medium can't enforce as authored; an inauthentic
   part-of-speech strand; a wrong example and stilted keys; telegraphed
   answers). None needs a rewrite; each needs a focused pass.

### 4.6 Lessons to use as models

- **Solve Equations by Graphing: x-Intercepts** — overall structure and
  calculator choreography (presets that preload evidence, scratch for the
  student's own work, gated entry for the transfer).
- **Find a Standard Regression Equation from Data** — explore-first
  Desmos: the student *does* the thing before it's named.
- **Solve Systems by Graphing** and **Rates in Two-Variable Equations** —
  what "one narrow tool, 24–28 blocks, no drift" looks like.
- **Probability from Tables** — SAT-authentic tables and distractors that
  are literally the test's traps.
- **Subject–Verb Agreement** — how to teach a shortcut responsibly: an
  explicit gate, every failure mode checked.
- **Good Cop / Bad Cop** — explanations: every distractor named and
  dismantled. Copy this register into the math lessons.
- **My Numbers** — the opening exploration; and **Command of Evidence** —
  using real bank questions as the transfer.

---

## 5. (d) Making lessons more interesting — and giving them personality

The lessons read like a very good, very careful teacher who is being
recorded. What's missing isn't jokes; it's *stakes, a point of view, and
a name for the move*. Concrete moves, cheapest first:

1. **Open every lesson with the payoff in one line.** Not "In this lesson
   you will…" but the test-day reason: *"This turns a two-minute factoring
   problem into a 20-second graph read."* / *"Boundaries questions are
   the fastest points on the R&W section — if you test punctuation in the
   right order."* Every lesson has a real answer to "why should I care";
   almost none says it.
2. **Name the move, and use the name.** The four lessons with names (Good
   Cop / Bad Cop, My Numbers, CLEAR, Odd-One-Out) are the ones a student
   will remember and a tutor will reference in session. Give the others a
   handle: "Zero-Graph-Click" for x-intercepts, "Total First" for
   probability tables, "Rank the Sides" for the altitude triangles,
   "Bracket the Pivot" for transitions. Then reuse the name in hints and
   explanations so it becomes vocabulary.
3. **Let the SAT be a character.** Frame distractors as traps the test
   set: *"The SAT is betting you'll grab the grand total. Don't."* The
   lessons already know the traps (Rates & Units block 8, Probability
   Tables 15–16, Command of Evidence 23) — say so out loud. It's
   motivating and it's the truth about how items are built.
4. **Break the cadence.** Retire the universal "Correct. … **Next, you
   will…**" tail and the identical "Without looking back, which
   sequence…" closer. Vary the explanation voice: sometimes a one-word
   "Yes." and a fresh example; sometimes a "here's the mistake most people
   make." Same for the finish: a lesson that ends with a genuinely hard
   "you vs. the SAT" item lands better than a summary card.
5. **Add a human.** Zero videos in the suite. A 60–90 second
   tutor-recorded intro per lesson (face, whiteboard, one line about why
   this move exists) adds presence for solo learners at trivial authoring
   cost — the `video` block already exists.
6. **Use the material's own drama.** The Devon-poem passage, the seedling
   graph, the dolphin-reef study — the R&W passages are already good
   stories; a one-line "the reason this passage is fun" or a real-world
   tag gives them texture. In math, real-unit contexts beat "Set A =
   [2,3,4,5]".
7. **Reward the right thing.** Once attempts are recorded, celebrate
   first-try streaks and "you didn't fall for the trap" moments in the
   completion banner rather than an always-100% score.

**Two rewrites of real lines, to show the register:**

> **Now (Desmos List Tools, block 1):** Look for questions that give
> several data values and ask you to transform, combine, or summarize
> them. Instead of retyping every calculation, store the values in a
> **list** and let one command act on the entire list.
>
> **Proposed:** Some SAT data questions hand you nine numbers and ask
> what happens to the mean if every value goes up by 4. You could retype
> nine numbers. Or you could type `A+4`. This lesson is the "or."

> **Now (x-Intercepts, block 3 explanation):** Right. The graph meets the
> horizontal axis at (2,0) and (3,0). **Next, you will name the
> horizontal axis and explain why the second coordinate is zero.**
>
> **Proposed:** Right — (2,0) and (3,0). Hold onto those two numbers:
> they're about to become the answer to an equation you haven't seen
> yet.

---

## 6. Fix list (verified against source on 2026-08-18)

### 6.1 Keying / rendering defects

- **scale-factor-and-similar-shapes**, block 39
  (`practice_volume_to_linear`): choice D `18:15` ≡ keyed B `6:5`.
  Replace D with a real error (`36:25` is already A; use `72:50` or
  `3:2`).
- **factor-out-greatest-common-factor**, block 9
  (`verify_by_distributing`): `\\(\times\\)` is single-escaped, so JSON
  parses `\t` as a tab and the callout renders "outside factor [tab]imes
  every inside term." Change to `\\(\\times\\)`. (Swept the corpus: this
  is the only instance.)
- **boundaries-punctuation-order**: 13 occurrences of `--` standing in
  for the em dash, plus block 24's sentence explaining the workaround.
  The em dash renders correctly in 15 other lessons; replace and delete
  the apology.
- **boundaries-transition-word-placement-and-logic**, block 28: "; though,
  the field remained wet" is presented as a valid transition placement.
  Rewrite as "; the field, though, remained wet" and keep the no-comma
  dependent-clause elimination.
- **words-in-context-read-predict-match**, blocks 12 and 16: the
  "grammar: noun/verb/adjective/adverb" test and the mixed-POS choice set
  (methodically / catalog / precise / organize) don't match how DSAT WIC
  items are built (choices always share a part of speech). Drop the
  bullet; give 16 four adjectives.
- **reading-comprehension-process-and-pre-answer**, block 22: keyed
  target says "Traffic noise" while the stem says only "near busy roads"
  — a new dot in a lesson that forbids new dots. Use "near busy roads."
- **standard-regression-from-data**, block 31: hint "substitute x=2; the
  result must be −3" also holds for distractor C (x²−2x−3). Use x=5 or
  x=−1.

### 6.2 Stems and hints that give the answer away (representative; the linter in §3.5 will find the rest)

- Stems that print what the exploration was supposed to produce:
  **systems-by-graphing** 11, 17, 20, 26 (the intersection);
  **functions** 14 ("(3,6)"); **percentages** 20, 22, 24 (answer stated
  on the prior slide / item repeated).
- Hints that state the computation or the setup: **similar-triangles**
  32, 35 ("Cross multiply: x²=144"); **custom-regression** 5, 24, 34;
  **factor-out-GCF** 32, 34; **factoring-polynomials** 13, 25, 32;
  **trig** 14, 17, 20, 39; **scale-factor** 26, 30, 36, 40, 41;
  **probability-tables** 16, 24; **rates-units** 9, 14, 22;
  **find-the-equation** 38. In retry mode a hint like this converts the
  "independent transfer" into a read after one wrong click.
- Final-retrieval checks where the key is the longest choice and the
  distractors are nonsense sequences: 28 of the 32 "without looking
  back…" checks. Shorten the key or lengthen the distractors into
  plausible-but-wrong orderings (e.g. the process with two steps
  swapped).

### 6.3 Claims for the tutoring team to verify or hedge

- **subject-verb-agreement** block 4: "accurate in every reviewed
  question" — hedge to "in our review of released forms" and re-check on
  a schedule, since the lesson tells students to skip reading the
  sentence.
- **desmos-list-tools** block 28: "`repeat()` is not supported in the
  testing version" — confirm against the current Bluebook calculator; if
  it's simply not a Desmos function, cut the block rather than warn about
  it.
- **percentages** block 4: the "%" → "of" auto-insert — confirm the
  Bluebook build behaves the same as the embedded pane, since the whole
  lesson leans on it.
- **standard-deviation**: add the sample-vs-population footnote (`stdev`
  vs `stdevp`) so a hand check doesn't contradict the lesson.
- **command-of-evidence** blocks 33/36: the debriefs restate the answers
  to two specific bank questions; if those items are edited, the debrief
  silently goes stale — note the coupling in the spec.

---

## 7. Method

- Synced `main` to `origin/main @ dca3e524`.
- Read the authoring skill (`.agents/skills/create-sat-lesson/`), the JSON
  authoring guide, the foundations/patterns design doc, and the runtime
  (`lib/ui/LessonSlideshow.jsx`, `lib/lesson/desmos-interactive.mjs`,
  `lib/sanitize.ts`) so lessons were judged against what the medium
  actually does.
- Profiled all 30 specs (block mix, check modes, correct-answer position,
  image/callout/Desmos counts, keyed-answer length vs distractors,
  extreme-word frequency).
- Rendered every spec to a plain-text transcript and read 12 in full
  directly (spanning subjects, dates, and statistical outliers); four
  parallel reviewers read the other 18 against a fixed rubric mapped to
  the four questions, recomputing math and checking DSAT authenticity;
  their defect claims were spot-verified against source.
- Queried production: 21 lessons imported as `draft` (2026-08-11), 9 not
  yet imported, zero `lesson_progress` rows.
- Not done: a live click-through in the student UI (no student usage
  existed yet, and the code paths are readable); no lesson content was
  modified.
