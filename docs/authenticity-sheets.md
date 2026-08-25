# Authenticity Sheets

> **Status: Living — derived 2026-08-25, pending tutor verification.**
> Plan step **2.7**, derived empirically instead of authored from
> memory: every number below is computed from the SAT Question Bank
> (authentic College Board Educator Question Bank items in
> `questions_v2`; 3430 live questions), with **SAT Practice
> Tests 9–11 as the canonical anchor for currency and operational
> weighting** (owner decision, 2026-08-25). "Recent" columns cover the
> 433 distinct questions on those
> three tests (241 R&W, 192 Math).
> Exemplars are cited by `display_code` — open them in the app; item
> text is College Board's and is not reproduced here.
>
> **Tutor verification pass (what only you can check):** (1) do the
> recent-test profiles match what students face this season — any
> format drift since PT11? (2) are the flagged weighting divergences
> real signals or small-sample noise? (3) curation — which formats do
> we drill? Regenerate after College Board updates the bank:
> `scripts/authenticity-sheets-queries.sql` + the assembler.

## How to use these in 2.4

An authentic-format item copies the skill's **near-invariant stem
verbatim** where one exists (all seven R&W skills have one), sits
inside the skill's **p25–p75 length band**, uses the skill's **choice
shape** (length and numeric mix), and matches the **hard-item
profile** when it's a transfer item. Exemplar codes give two real
items per difficulty band to imitate structurally.

## Headline findings

- **R&W stems are fixed sentences.** Every R&W skill runs on one
  (or for Text Structure and Purpose, four) essentially invariant
  closing questions — authentic items must use them verbatim, not
  paraphrase.
- **The Surveys gap:** "Inference from sample statistics and margin
  of error" (24 bank items) and "Evaluating statistical claims" (11)
  appear **zero times on PT9–11**. The current test samples this
  content thinly — relevant to the Surveys lesson's priority and to
  Phase 4's re-scoping decision.
- **SPR is a real share of math** (24.0% of bank math items, similar on
  recent tests) — support for keeping 1.6 (numeric-entry checks) on
  the roadmap.
- **Hard math adds words.** In most math skills the hard band's
  median stem is 30–60% longer than the easy band's — difficulty
  arrives as setup and context, not just harder arithmetic.

## Information and Ideas

### Central Ideas and Details

_Information and Ideas · our lessons: reading-comprehension-process-and-pre-answer; good-cop-bad-cop-reading-answers_

**Weighting.** 123 bank items (7.3% of the R&W bank); 18 on PT9–11 (7.5% of recent R&W test items).

**Stem length** (passage + question, words): bank p25/50/75/90 = 94/102/109/132; recent = 86/94/105/123.

**Choices** (MCQ): median choice length 14.8 words (p90 25); 0% of items have all-numeric choices — recent: 15 words (p90 29), 0% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "which choice best states the main idea of the text?" — 48 bank / 5 recent
- (6 items end in a statement or blank rather than a question — typically SPR or fill-in formats)

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 33 | 4 | 102 | RW-00367, RW-01250 |
| medium | 45 | 4 | 100 | RW-00334, RW-01055 |
| hard | 38 | 3 | 102 | RW-00131, RW-00299 |


### Command of Evidence

_Information and Ideas · our lessons: command-of-evidence-clear-the-claim_

**Weighting.** 256 bank items (15.2% of the R&W bank); 34 on PT9–11 (14.1% of recent R&W test items).

**Stem length** (passage + question, words): bank p25/50/75/90 = 87/117/149/193; recent = 74/120/162/174.

**Choices** (MCQ): median choice length 20.9 words (p90 34.2); 3% of items have all-numeric choices — recent: 20 words (p90 33.2), 3% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "which choice most effectively uses data from the table to complete the statement?" — 23 bank / 2 recent
- "which choice most effectively uses data from the table to complete the text?" — 8 bank / 1 recent
- "which choice most effectively uses data from the table to complete the example?" — 8 bank / 1 recent
- "which choice most effectively uses data from the graph to complete the statement?" — 6 bank / 1 recent
- "which choice most effectively uses data from the graph to complete the text?" — 5 bank / 0 recent
- (9 items end in a statement or blank rather than a question — typically SPR or fill-in formats)

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 70 | 3 | 94 | RW-00248, RW-00472 |
| medium | 78 | 10 | 114 | RW-00264, RW-00361 |
| hard | 97 | 10 | 127 | RW-00396, RW-00529 |

_Hard items run longer here (127w vs 94w median) — difficulty comes with added setup, not just harder numbers._


### Inferences

_Information and Ideas · our lessons: inference-minimum-supported-conclusion_

**Weighting.** 124 bank items (7.4% of the R&W bank); 15 on PT9–11 (6.2% of recent R&W test items).

**Stem length** (passage + question, words): bank p25/50/75/90 = 92/104/115/124; recent = 82/93/112/118.

**Choices** (MCQ): median choice length 16 words (p90 27); 0% of items have all-numeric choices — recent: 12.8 words (p90 23), 0% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "which choice most logically completes the text?" — 124 bank / 15 recent — **near-invariant: use verbatim**

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 20 | 1 | 100 | RW-00228, RW-00075 |
| medium | 41 | 4 | 100 | RW-00161, RW-00347 |
| hard | 57 | 5 | 109 | RW-00098, RW-00139 |


## Craft and Structure

### Cross-Text Connections

_Craft and Structure · our lessons: —_

**Weighting.** 59 bank items (3.5% of the R&W bank); 5 on PT9–11 (2.1% of recent R&W test items).

**Stem length** (passage + question, words): bank p25/50/75/90 = 154/162/168/173; recent = 154/159/160/169.

**Choices** (MCQ): median choice length 19.1 words (p90 26.5); 0% of items have all-numeric choices — recent: 19 words (p90 22.2), 0% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "based on the texts, both authors would most likely agree with which statement?" — 5 bank / 1 recent
- "based on the texts, how would the author of text # most likely respond to the underlined claim in text #?" — 4 bank / 0 recent

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 16 | 0 | 162 | RW-00005, RW-00385 |
| medium | 20 | 1 | 159 | RW-01416, RW-00007 |
| hard | 21 | 2 | 161 | RW-00842, RW-01615 |


### Text Structure and Purpose

_Craft and Structure · our lessons: —_

**Weighting.** 137 bank items (8.1% of the R&W bank); 20 on PT9–11 (8.3% of recent R&W test items).

**Stem length** (passage + question, words): bank p25/50/75/90 = 91/101/109/132; recent = 91/103/119/129.

**Choices** (MCQ): median choice length 14 words (p90 24.1); 0% of items have all-numeric choices — recent: 12.8 words (p90 21.7), 0% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "which choice best states the main purpose of the text?" — 44 bank / 6 recent
- "which choice best describes the overall structure of the text?" — 26 bank / 4 recent
- "which choice best describes the function of the underlined sentence in the text as a whole?" — 19 bank / 3 recent
- "which choice best describes the function of the underlined portion in the text as a whole?" — 16 bank / 5 recent

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 41 | 5 | 98 | RW-00349, RW-00485 |
| medium | 53 | 4 | 104 | RW-00959, RW-00965 |
| hard | 37 | 5 | 102 | RW-00016, RW-00441 |


### Words in Context

_Craft and Structure · our lessons: words-in-context-read-predict-match_

**Weighting.** 242 bank items (14.4% of the R&W bank); 37 on PT9–11 (15.4% of recent R&W test items).

**Stem length** (passage + question, words): bank p25/50/75/90 = 61/67/75/88; recent = 61/70/75/77.

**Choices** (MCQ): median choice length 1 words (p90 2); 0% of items have all-numeric choices — recent: 1 words (p90 2), 0% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "which choice completes the text with the most logical and precise word or phrase?" — 203 bank / 35 recent
- (4 items end in a statement or blank rather than a question — typically SPR or fill-in formats)

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 123 | 14 | 66 | RW-00015, RW-00392 |
| medium | 54 | 3 | 66 | RW-00221, RW-00615 |
| hard | 51 | 8 | 70 | RW-00039, RW-00789 |


## Expression of Ideas

### Rhetorical Synthesis

_Expression of Ideas · our lessons: rhetorical-synthesis-goal-first_

**Weighting.** 195 bank items (11.6% of the R&W bank); 32 on PT9–11 (13.3% of recent R&W test items).

**Stem length** (passage + question, words): bank p25/50/75/90 = 93/106/116/124; recent = 94/104/121/132.

**Choices** (MCQ): median choice length 19.8 words (p90 24.5); 0% of items have all-numeric choices — recent: 21.5 words (p90 24.7), 0% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "which choice most effectively uses relevant information from the notes to accomplish this goal?" — 179 bank / 31 recent — **near-invariant: use verbatim**
- (6 items end in a statement or blank rather than a question — typically SPR or fill-in formats)

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 41 | 5 | 89 | RW-00099, RW-00247 |
| medium | 99 | 13 | 106 | RW-00318, RW-00419 |
| hard | 44 | 4 | 115 | RW-00830, RW-01194 |


### Transitions

_Expression of Ideas · our lessons: transitions-bracket-the-pivot_

**Weighting.** 171 bank items (10.1% of the R&W bank); 27 on PT9–11 (11.2% of recent R&W test items).

**Stem length** (passage + question, words): bank p25/50/75/90 = 59/64/69/74; recent = 62/66/72/76.

**Choices** (MCQ): median choice length 1.5 words (p90 2); 0% of items have all-numeric choices — recent: 1.5 words (p90 2.1), 0% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "which choice completes the text with the most logical transition?" — 171 bank / 27 recent — **near-invariant: use verbatim**

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 71 | 7 | 61 | RW-00171, RW-00397 |
| medium | 57 | 9 | 65 | RW-00105, RW-00297 |
| hard | 33 | 2 | 70 | RW-00777, RW-00960 |


## Standard English Conventions

### Boundaries

_Standard English Conventions · our lessons: boundaries-punctuation-order; boundaries-transition-word-placement-and-logic_

**Weighting.** 189 bank items (11.2% of the R&W bank); 24 on PT9–11 (10.0% of recent R&W test items).

**Stem length** (passage + question, words): bank p25/50/75/90 = 55/62/68/72; recent = 58/65/70/75.

**Choices** (MCQ): median choice length 2 words (p90 5); 0% of items have all-numeric choices — recent: 2.8 words (p90 4), 4% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "which choice completes the text so that it conforms to the conventions of standard english?" — 188 bank / 24 recent — **near-invariant: use verbatim**

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 55 | 5 | 57 | RW-00557, RW-00588 |
| medium | 49 | 3 | 65 | RW-00123, RW-01410 |
| hard | 78 | 9 | 64 | RW-00060, RW-00412 |


### Form, Structure, and Sense

_Standard English Conventions · our lessons: subject-verb-agreement-odd-one-out_

**Weighting.** 190 bank items (11.3% of the R&W bank); 29 on PT9–11 (12.0% of recent R&W test items).

**Stem length** (passage + question, words): bank p25/50/75/90 = 51/59/66/71; recent = 48/62/72/78.

**Choices** (MCQ): median choice length 1.5 words (p90 9.3); 0% of items have all-numeric choices — recent: 1.5 words (p90 13.4), 0% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "which choice completes the text so that it conforms to the conventions of standard english?" — 190 bank / 29 recent — **near-invariant: use verbatim**

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 87 | 10 | 58 | RW-00027, RW-00117 |
| medium | 43 | 2 | 62 | RW-00332, RW-00504 |
| hard | 48 | 6 | 62 | RW-00208, RW-00251 |


## Algebra

### Linear equations in one variable

_Algebra · our lessons: —_

**Weighting.** 108 bank items (6.2% of the Math bank); 10 on PT9–11 (5.2% of recent Math test items). Student-produced response: 28.7% of bank items, 20.0% of recent. 3.7% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 17/22/36/58; recent = 14/16/33/40.

**Choices** (MCQ): median choice length 2 words (p90 8.1); 64% of items have all-numeric choices — recent: 3.4 words (p90 9), 38% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "if # x = # , what is the value of # x ?" — 5 bank / 1 recent
- (7 items end in a statement or blank rather than a question — typically SPR or fill-in formats)

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 60 | 5 | 17 | M-00133, M-00160 |
| medium | 29 | 5 | 32 | M-00213, M-00516 |
| hard | 19 | 0 | 29 | M-00022, M-00040 |

_Hard items run longer here (29w vs 17w median) — difficulty comes with added setup, not just harder numbers._


### Linear equations in two variables

_Algebra · our lessons: find-the-equation-with-my-numbers; rates-and-units-in-two-variable-equations_

**Weighting.** 127 bank items (7.3% of the Math bank); 14 on PT9–11 (7.3% of recent Math test items). Student-produced response: 26.8% of bank items, 21.4% of recent. 5.5% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 31/42/55/64; recent = 34/44/56/72.

**Choices** (MCQ): median choice length 5 words (p90 10.5); 44% of items have all-numeric choices — recent: 8.5 words (p90 10), 18% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "what is the slope of line j ?" — 6 bank / 1 recent
- "which equation represents this situation?" — 6 bank / 1 recent

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 54 | 7 | 40 | M-00064, M-00338 |
| medium | 41 | 3 | 49 | M-00604, M-01545 |
| hard | 32 | 4 | 46 | M-00189, M-00603 |


### Linear functions

_Algebra · our lessons: —_

**Weighting.** 157 bank items (9.0% of the Math bank); 19 on PT9–11 (9.9% of recent Math test items). Student-produced response: 19.1% of bank items, 31.6% of recent. 3.8% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 28/42/55/66; recent = 34/42/53/58.

**Choices** (MCQ): median choice length 3.9 words (p90 11.8); 42% of items have all-numeric choices — recent: 3 words (p90 8.4), 54% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "which equation defines f ?" — 7 bank / 1 recent
- "what is the value of b ?" — 5 bank / 2 recent
- "what is the value of f # ?" — 4 bank / 1 recent
- "what is the value of a ?" — 4 bank / 1 recent
- "which of the following is the best interpretation of # in this context?" — 4 bank / 0 recent
- (4 items end in a statement or blank rather than a question — typically SPR or fill-in formats)

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 77 | 7 | 38 | M-00015, M-00422 |
| medium | 54 | 9 | 40 | M-00736, M-00879 |
| hard | 26 | 3 | 50 | M-00567, M-00752 |

_Hard items run longer here (50w vs 38w median) — difficulty comes with added setup, not just harder numbers._


### Linear inequalities in one or two variables

_Algebra · our lessons: —_

**Weighting.** 72 bank items (4.1% of the Math bank); 9 on PT9–11 (4.7% of recent Math test items). Student-produced response: 12.5% of bank items, 11.1% of recent. 5.6% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 33/51/62/78; recent = 43/54/67/74.

**Choices** (MCQ): median choice length 5 words (p90 10); 29% of items have all-numeric choices — recent: 2.5 words (p90 4.9), 75% all-numeric.

**Stem templates:** stems mostly end in a statement or computation setup rather than a shared question sentence (4 such items); no dominant template — vary phrasing, keep the length profile.

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 26 | 4 | 50 | M-00212, M-00519 |
| medium | 27 | 1 | 49 | M-01504, M-00216 |
| hard | 19 | 4 | 58 | M-00716, M-01115 |


### Systems of two linear equations in two variables

_Algebra · our lessons: solving-systems-of-equations-by-graphing; special-systems-no-solution-and-infinitely-many_

**Weighting.** 116 bank items (6.7% of the Math bank); 16 on PT9–11 (8.3% of recent Math test items). Student-produced response: 26.7% of bank items, 31.3% of recent. 12.9% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 31/36/50/72; recent = 35/38/54/73.

**Choices** (MCQ): median choice length 2.5 words (p90 12.4); 62% of items have all-numeric choices — recent: 3 words (p90 9.5), 55% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "what is the value of x ?" — 11 bank / 1 recent
- "what is the value of y ?" — 10 bank / 4 recent
- "what is the value of # x ?" — 4 bank / 0 recent
- (6 items end in a statement or blank rather than a question — typically SPR or fill-in formats)

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 37 | 6 | 35 | M-00374, M-00435 |
| medium | 41 | 4 | 34 | M-00301, M-00790 |
| hard | 38 | 6 | 42 | M-00038, M-00440 |


## Advanced Math

### Equivalent expressions

_Advanced Math · our lessons: factor-out-greatest-common-factor; factoring-polynomials…; advanced-factoring…; my-numbers-strategy_

**Weighting.** 107 bank items (6.1% of the Math bank); 11 on PT9–11 (5.7% of recent Math test items). Student-produced response: 13.1% of bank items, 9.1% of recent. 15.9% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 12/15/23/32; recent = 15/24/28/40.

**Choices** (MCQ): median choice length 3.5 words (p90 9.7); 36% of items have all-numeric choices — recent: 7.8 words (p90 11.3), 10% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "which of the following is equivalent to the expression above?" — 5 bank / 0 recent
- "which of the following is equivalent to ?" — 4 bank / 0 recent

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 40 | 4 | 13 | M-00384, M-01164 |
| medium | 38 | 4 | 17 | M-00355, M-00749 |
| hard | 29 | 3 | 24 | M-00397, M-00658 |

_Hard items run longer here (24w vs 13w median) — difficulty comes with added setup, not just harder numbers._


### Nonlinear equations in one variable and systems of equations in two variables

_Advanced Math · our lessons: solving-equations-by-graphing-x-intercepts; solving-equations-with-regression_

**Weighting.** 153 bank items (8.8% of the Math bank); 16 on PT9–11 (8.3% of recent Math test items). Student-produced response: 29.4% of bank items, 18.8% of recent. 20.3% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 19/28/37/51; recent = 21/32/36/38.

**Choices** (MCQ): median choice length 2.5 words (p90 7.3); 59% of items have all-numeric choices — recent: 4.5 words (p90 8.1), 46% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "what is the value of k ?" — 6 bank / 2 recent
- "what is the value of c ?" — 5 bank / 1 recent
- "what is the solution x , y to this system?" — 4 bank / 0 recent
- "what is the value of x ?" — 4 bank / 0 recent

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 38 | 2 | 31 | M-00120, M-01451 |
| medium | 59 | 6 | 21 | M-00406, M-00759 |
| hard | 56 | 8 | 34 | M-00197, M-00200 |


### Nonlinear functions

_Advanced Math · our lessons: functions-and-function-notation; custom-regression-from-data; standard-regression-from-data_

**Weighting.** 236 bank items (13.5% of the Math bank); 31 on PT9–11 (16.1% of recent Math test items) — recent tests weight this HIGHER than the bank does (+2.6 pts). Student-produced response: 22.0% of bank items, 29.0% of recent. 9.7% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 35/48/64/83; recent = 37/46/65/86.

**Choices** (MCQ): median choice length 3.1 words (p90 15.7); 49% of items have all-numeric choices — recent: 5 words (p90 18.8), 36% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "what is the value of f # ?" — 8 bank / 0 recent
- "what is the value of y ?" — 6 bank / 1 recent
- "which equation defines f ?" — 4 bank / 1 recent
- (9 items end in a statement or blank rather than a question — typically SPR or fill-in formats)

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 57 | 4 | 53 | M-00375, M-01153 |
| medium | 88 | 17 | 46 | M-00138, M-00151 |
| hard | 91 | 10 | 48 | M-00046, M-00209 |


## Problem-Solving and Data Analysis

### Evaluating statistical claims: Observational studies and experiments

_Problem-Solving and Data Analysis · our lessons: surveys-sampling-and-margin-of-error (partial)_

**Weighting.** 11 bank items (0.6% of the Math bank); 0 on PT9–11 (0.0% of recent Math test items) — **absent from all three recent tests**. 0.0% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 56/70/82/123.

**Choices** (MCQ): median choice length 11 words (p90 15.3); 0% of items have all-numeric choices.

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 2 | 0 | 62 | M-00134, M-01398 |
| medium | 3 | 0 | 80 | M-00156, M-00349 |
| hard | 6 | 0 | 72 | M-00237, M-00278 |


### Inference from sample statistics and margin of error

_Problem-Solving and Data Analysis · our lessons: surveys-sampling-and-margin-of-error_

**Weighting.** 24 bank items (1.4% of the Math bank); 0 on PT9–11 (0.0% of recent Math test items) — **absent from all three recent tests**. Student-produced response: 4.2% of bank items. 12.5% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 58/73/76/91.

**Choices** (MCQ): median choice length 10 words (p90 19.7); 35% of items have all-numeric choices.

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 9 | 0 | 66 | M-00405, M-00591 |
| medium | 11 | 0 | 73 | M-00078, M-00510 |
| hard | 4 | 0 | 78 | M-00154, M-00663 |


### One-variable data: Distributions and measures of center and spread

_Problem-Solving and Data Analysis · our lessons: standard-deviation; desmos-list-tools_

**Weighting.** 76 bank items (4.4% of the Math bank); 8 on PT9–11 (4.2% of recent Math test items). Student-produced response: 25.0% of bank items, 37.5% of recent. 25.0% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 32/56/74/105; recent = 48/60/110/158.

**Choices** (MCQ): median choice length 2 words (p90 15); 50% of items have all-numeric choices — recent: 2 words (p90 2.8), 60% all-numeric.

**Stem templates:** stems mostly end in a statement or computation setup rather than a shared question sentence (10 such items); no dominant template — vary phrasing, keep the length profile.

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 34 | 4 | 48 | M-00578, M-00654 |
| medium | 20 | 2 | 45 | M-00775, M-00794 |
| hard | 22 | 2 | 74 | M-01203, M-01440 |

_Hard items run longer here (74w vs 48w median) — difficulty comes with added setup, not just harder numbers._


### Percentages

_Problem-Solving and Data Analysis · our lessons: percentages-and-percent-change_

**Weighting.** 78 bank items (4.5% of the Math bank); 6 on PT9–11 (3.1% of recent Math test items). Student-produced response: 33.3% of bank items, 50.0% of recent. 3.8% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 20/32/49/63; recent = 20/33/40/46.

**Choices** (MCQ): median choice length 2 words (p90 2); 86% of items have all-numeric choices — recent: 2 words (p90 2), 100% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "what is the value of p ?" — 5 bank / 0 recent
- "what is # % of # ?" — 4 bank / 0 recent

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 28 | 3 | 22 | M-00070, M-00263 |
| medium | 22 | 1 | 28 | M-01592, M-00145 |
| hard | 28 | 2 | 42 | M-00848, M-01047 |

_Hard items run longer here (42w vs 22w median) — difficulty comes with added setup, not just harder numbers._


### Probability and conditional probability

_Problem-Solving and Data Analysis · our lessons: probability-from-tables-favorable-over-total_

**Weighting.** 45 bank items (2.6% of the Math bank); 4 on PT9–11 (2.1% of recent Math test items). Student-produced response: 17.8% of bank items, 0.0% of recent. 33.3% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 40/64/80/88; recent = 50/60/69/73.

**Choices** (MCQ): median choice length 2 words (p90 3); 88% of items have all-numeric choices — recent: 4 words (p90 4), 100% all-numeric.

**Stem templates:** stems mostly end in a statement or computation setup rather than a shared question sentence (8 such items); no dominant template — vary phrasing, keep the length profile.

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 23 | 3 | 42 | M-00249, M-00541 |
| medium | 14 | 0 | 68 | M-00007, M-00047 |
| hard | 8 | 1 | 82 | M-00451, M-00882 |

_Hard items run longer here (82w vs 42w median) — difficulty comes with added setup, not just harder numbers._


### Ratios, rates, proportional relationships, and units

_Problem-Solving and Data Analysis · our lessons: —_

**Weighting.** 87 bank items (5.0% of the Math bank); 8 on PT9–11 (4.2% of recent Math test items). Student-produced response: 35.6% of bank items, 25.0% of recent. 2.3% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 26/33/45/55; recent = 24/34/44/60.

**Choices** (MCQ): median choice length 2 words (p90 4); 76% of items have all-numeric choices — recent: 2 words (p90 4.3), 67% all-numeric.

**Stem templates:** stems mostly end in a statement or computation setup rather than a shared question sentence (31 such items); no dominant template — vary phrasing, keep the length profile.

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 39 | 2 | 27 | M-00025, M-00265 |
| medium | 33 | 3 | 37 | M-00267, M-00853 |
| hard | 15 | 3 | 47 | M-00144, M-00797 |

_Hard items run longer here (47w vs 27w median) — difficulty comes with added setup, not just harder numbers._


### Two-variable data: Models and scatterplots

_Problem-Solving and Data Analysis · our lessons: custom-regression-from-data; standard-regression-from-data_

**Weighting.** 66 bank items (3.8% of the Math bank); 8 on PT9–11 (4.2% of recent Math test items). Student-produced response: 10.6% of bank items, 0.0% of recent. 27.3% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 47/69/109/119; recent = 34/89/91/92.

**Choices** (MCQ): median choice length 2 words (p90 8.3); 61% of items have all-numeric choices — recent: 2.3 words (p90 6.4), 38% all-numeric.

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 31 | 3 | 72 | M-00012, M-00323 |
| medium | 24 | 4 | 87 | M-00343, M-00482 |
| hard | 11 | 1 | 54 | M-00549, M-00001 |


## Geometry and Trigonometry

### Area and volume

_Geometry and Trigonometry · our lessons: scale-factor-and-similar-shapes_

**Weighting.** 89 bank items (5.1% of the Math bank); 9 on PT9–11 (4.7% of recent Math test items). Student-produced response: 25.8% of bank items, 33.3% of recent. 5.6% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 25/32/44/61; recent = 27/36/40/46.

**Choices** (MCQ): median choice length 2 words (p90 3.6); 83% of items have all-numeric choices — recent: 2 words (p90 3.8), 50% all-numeric.

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 29 | 3 | 27 | M-00111, M-01049 |
| medium | 31 | 2 | 30 | M-01541, M-01583 |
| hard | 29 | 4 | 42 | M-00728, M-00983 |

_Hard items run longer here (42w vs 27w median) — difficulty comes with added setup, not just harder numbers._


### Circles

_Geometry and Trigonometry · our lessons: —_

**Weighting.** 53 bank items (3.0% of the Math bank); 6 on PT9–11 (3.1% of recent Math test items). Student-produced response: 26.4% of bank items, 33.3% of recent. 13.2% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 25/35/42/68; recent = 23/34/49/64.

**Choices** (MCQ): median choice length 2 words (p90 12.3); 57% of items have all-numeric choices — recent: 7.8 words (p90 15.3), 50% all-numeric.

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 3 | 0 | 21 | M-00693, M-00811 |
| medium | 15 | 2 | 30 | M-01072, M-01507 |
| hard | 35 | 4 | 37 | M-00162, M-00392 |

_Hard items run longer here (37w vs 21w median) — difficulty comes with added setup, not just harder numbers._


### Lines, angles, and triangles

_Geometry and Trigonometry · our lessons: similar-triangles_

**Weighting.** 83 bank items (4.8% of the Math bank); 11 on PT9–11 (5.7% of recent Math test items). Student-produced response: 27.7% of bank items, 9.1% of recent. 25.3% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 20/37/65/95; recent = 41/53/82/96.

**Choices** (MCQ): median choice length 2 words (p90 5.1); 60% of items have all-numeric choices — recent: 2 words (p90 4.8), 50% all-numeric.

**Stem templates** (trailing question, numbers → #):

- "what is the value of x ?" — 7 bank / 0 recent
- (13 items end in a statement or blank rather than a question — typically SPR or fill-in formats)

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 33 | 3 | 29 | M-00641, M-01250 |
| medium | 23 | 4 | 42 | M-00431, M-00826 |
| hard | 27 | 4 | 56 | M-00687, M-00953 |

_Hard items run longer here (56w vs 29w median) — difficulty comes with added setup, not just harder numbers._


### Right triangles and trigonometry

_Geometry and Trigonometry · our lessons: right-triangle-trigonometry-sohcahtoa; special-right-triangles-45-45-90-and-30-60-90_

**Weighting.** 56 bank items (3.2% of the Math bank); 6 on PT9–11 (3.1% of recent Math test items). Student-produced response: 35.7% of bank items, 33.3% of recent. 21.4% carry a stimulus (figure/table/context block).

**Stem length** (passage + question, words): bank p25/50/75/90 = 17/26/44/54; recent = 31/44/83/97.

**Choices** (MCQ): median choice length 2 words (p90 4); 81% of items have all-numeric choices — recent: 3.1 words (p90 3.8), 75% all-numeric.

**Stem templates:** stems mostly end in a statement or computation setup rather than a shared question sentence (7 such items); no dominant template — vary phrasing, keep the length profile.

**Difficulty profile** (bands 1–3 easy · 4–5 medium · 6–7 hard):

| Band | Bank | Recent | Median words | Exemplars |
|---|---|---|---|---|
| easy | 11 | 2 | 3 | M-00254, M-00779 |
| medium | 14 | 2 | 37 | M-00465, M-01174 |
| hard | 31 | 2 | 27 | M-00640, M-00720 |

_Hard items run longer here (27w vs 3w median) — difficulty comes with added setup, not just harder numbers._

