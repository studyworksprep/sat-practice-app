# DC question-bank formatting audit

> **Status: Historical document.** Production inventory and official-source comparisons verified October 8, 2026. This investigation prepared local repair previews; it did not update production questions or deploy application changes.

**Follow-up:** The eight reviewed examples were subsequently normalized in production. See [the first-batch publication record](dc-question-normalization-2026-10-08.md) for the applied changes and verification; the findings below describe the original inventory.

The production bank has **459 published Math questions** whose `source_external_id` matches `^[0-9]{5,6}-DC$`. Their rendering can be made consistent with current questions by converting verified equation images to TeX, normalizing their HTML, and rebuilding the existing MathJax caches. This needs source and visual checks: the current speech-to-TeX helper sometimes produces valid-looking output with the wrong mathematical structure.

## Scope and source verification

The production project is `noqtadytxyslkoetchrs` (SAT Question Bank). The development project named in `.env.local` contains only 20 matching records and is not representative. All database inspection used `public.questions_v2`.

| Measure | Result |
| --- | ---: |
| Five-digit DC identifiers | 187 |
| Six-digit DC identifiers | 272 |
| Published, undeleted, standard-pool questions | 459 |
| Multiple-choice questions | 389 |
| Student-produced response questions | 70 |
| Questions currently marked Broken | 0 |
| Official API responses retrieved with matching item identifiers | 459 |
| Responses containing a question prompt | 458 |
| Stored primary answers agreeing with official evidence | 459 |

Official records were retrieved from the [SAT Suite Educator Question Bank](https://satsuiteeducatorquestionbank.collegeboard.org/) website's internal API:

```text
POST https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-question
{"external_id":"<source_external_id>"}
```

Every response uses the older format: `item_id`, optional `body`, `prompt`, and `answer`. The newer format uses `stem`, `stimulus`, `answerOptions`, `correct_answer`, and `rationale`. The DC suffix identifies a response format, not an alternate question renderer in the application. These dates and responses do not establish the original import batch or chronological age of every individual question.

378 multiple-choice responses have an explicit answer key. Eleven other multiple-choice responses omit it, but their explanation starts with the correct choice. The 70 numerical responses were checked against the opening answer statement in their official explanation. The five questions with multiple mathematically distinct valid numerical answers already retain those alternatives in `correct_answer.text`.

**M-00861 (`029650-DC`) is an exception:** the API returns its table and explanation but no `prompt`. Its stored numerical answer, 8, agrees with the official explanation. Preserve its current prompt and hold any full source replacement until another authoritative copy supplies the missing prompt.

Raw responses, retrieval dates, and SHA-256 hashes are saved in the source manifest (`tmp/dc-question-audit-2026-10-08/source-manifest.json`, retained locally). The full production snapshot and official responses are in the same audit directory.

## Why the questions look different

The shared [MathJax renderer](../lib/content/render-math.mjs) processes TeX and MathML. It passes images through unchanged. A cached rendering of a question containing equation PNGs therefore still contains those PNGs; regenerating the caches alone cannot make them MathJax expressions.

The inventory recognizes both `role="math"` and `class="math-img"`:

| Finding | Questions or elements |
| --- | ---: |
| Questions with equation images | 362 |
| Questions with equation images in the stimulus, prompt, or choices | 182 |
| Questions with equation images in the explanation | 344 |
| Questions with equation images only in the explanation | 180 |
| Equation images across all fields | 3,160 |
| Other image elements, such as graphs and diagrams | 107 |
| Questions retaining older presentation classes | 450 |
| Questions with nested paragraph markup in the saved HTML | 370 |
| Questions with nested tables | 6 |
| Questions with paragraph alignment attributes | 26 |
| Questions without saved rendering timestamps/caches | 11 |

Most equation images are in explanations: 2,463 of 3,160. That explains why some stems and choices already look modern while the explanation still looks different.

The [shared question styles](../lib/ui/QuestionRenderer.module.css) and [prose styles](../app/styles/next-prose.css) display general images as blocks with margins and figure-size limits. Old inline equation images therefore break prose into separate lines and create excessive whitespace. Older `span.italic` markup does not receive the semantic `<em>` styling provided by the current prose stylesheet. Finally, paragraph `align` attributes are not retained by the question sanitizer; alignment should be expressed with supported CSS or display math.

M-00054 demonstrates the main problem: the current prompt and explanation contain small equation PNGs that each occupy a separate line. Its proposed comparison (`tmp/dc-question-audit-2026-10-08/previews/M-00054.html`, retained locally) replaces them with TeX, making the prompt and explanation flow normally with the same math styling as other questions.

## Content findings that should accompany formatting work

The approximate text comparison flagged a review queue, not a confirmed defect count. It compares combined stimulus/prompt content as well as individual fields, tolerates whitespace and equivalent symbols, and uses the existing speech parser to compare some image descriptions. Rendered tables versus original table images, abbreviated units, speech descriptions of equation systems, and differences in accessibility text all generate candidates. A matching signature is also not proof of mathematical equivalence, because it does not encode fraction or exponent structure.

Three defects were independently confirmed:

| Question | Stored content | Official evidence | Proposed correction |
| --- | --- | --- | --- |
| M-00010 | Stimulus includes an extra “Which statement about the graph is true?” sentence, in addition to the actual earnings question in the stem | The official stimulus is the graph; the official prompt asks for the total earnings | Remove the extraneous stimulus sentence; retain the graph and actual prompt |
| M-00158 | Rebuilt table omits its title | Original table image includes a title describing residents with a bachelor's degree or higher; its seven data rows agree with the stored table | Restore the title as a table caption |
| M-01477 | Choice C is `6x - 2y = 10` | Both the official image pixels and its alt text show `6x - 2y = 0` | Restore the distractor's constant to 0; retain the correct answer B |

These are recorded findings, not live repairs. The complete comparison inventory (`tmp/dc-question-audit-2026-10-08/inventory.json`, retained locally) retains the other candidates for further review.

## Conversion safeguards

The current [speech-to-TeX helper](../lib/content/speakmath-to-tex.mjs) and [image replacement helper](../lib/content/replace-math-images.mjs) are useful starting points but should not be used as an unchecked bulk publication step.

The audit classified the 3,160 current equation images as follows:

| Screening result | Instances |
| --- | ---: |
| Candidate conversion that passes the implemented syntax screening | 2,801 |
| Parser returns no conversion | 140 |
| Residual speech words remain in the proposed TeX | 124 |
| Commas need interpretation as numbers versus coordinates | 93 |
| Braces or parentheses are unbalanced | 2 |

The 2,801 candidates are **not automatically approved conversions**. Syntax checks cannot verify meaning. For example:

- An expression involving `f(x)/g(x)` can become `f(\frac{x}{g}) of x`.
- A fraction with denominator `(b-2)` can become `\frac{8}{(b} - 2)`, moving part of the denominator outside the fraction.
- Thousands-separated values such as `1,576` can be misread as coordinate pairs.
- The description of `1.082^q` can become `1.08 2^{q}`, changing a decimal base into a product.
- “Plus or minus” can survive as the letters `or` instead of `\pm`.
- Speech saying “times” can describe implied multiplication in the pixels. Preserve `60(1)` when that is what the original image shows.

Use only explicitly identified math images for conversion. Graphs, diagrams, and table images need their own preservation checks. Keep an image when its mathematical interpretation is uncertain; never replace it with a placeholder or omit it.

## Prepared pilot repairs

Eight representative local proposals cover numerical responses, table formatting, preserved graph images, polynomials in prompts and options, mixed prose/fractions, standalone equations, aligned equation systems, and explanation-only equation conversions.

| Question | Demonstration |
| --- | --- |
| M-00005 | Convert eight explanation equations; preserve numerical answer |
| M-00006 | Clean table wrappers and convert explanation equations |
| M-00016 | Preserve the original graph; convert four explanation equations |
| M-00054 | Convert polynomial images in the prompt, all choices, and explanation |
| M-00059 | Convert a fraction inside prose and all equation choices |
| M-00061 | Move the leading equation into a centered stimulus; normalize numerical options |
| M-00211 | Render the two equations as an aligned display and normalize explanation variables |
| M-00340 | Remove restrictive table sizing; convert the percentage-change equation and numerical choices |

The preview gallery (`tmp/dc-question-audit-2026-10-08/previews/index.html`, retained locally) uses the current shared `QuestionRenderer`, the current sanitizer, and the current question/prose styles. Browser layout checks passed for all eight pages at 1,440px and 400px widths: no overflow in the proposed question cards, no broken images, no remaining equation-image markers, no old formatting classes, and no math error nodes. Forty-three equation images were converted; the 42 distinct formulas were also compared visually with the original PNG pixels. The graph, table data, answer keys, and option identities were preserved.

The local proposals include expected question timestamps and official source hashes. They are intentionally a pilot, not a complete production update package. M-00211 merges individual variable spans into complete equations; its explanation was reviewed separately after that transformation.

## Recommended implementation

1. **Use the bank's existing content conventions.** Store inline expressions as `\(...\)` and standalone/multiline expressions as `\[...\]`. Use the established paragraph/table classes and supported `text-align` styles. Keep real graphs as figures. Preserve mathematical grouping, punctuation, labels, captions, and source order.
2. **Normalize every content field together.** Include `rationale_html`; the existing “Fix with Claude” question payload focuses on stimulus, stem, and options and would leave many of these explanation defects behind.
3. **Add a conservative official-source adapter.** Support both response schemas and partial records. Verify the external identity, all choices, answer evidence, and source hashes. Missing fields must leave existing content intact and require review.
4. **Use structured conversion plus visual evidence.** Improve decimal, function, fraction, exponent, and coordinate handling. Reject residual words and unbalanced structures. Keep a review list of ambiguous expressions and explicit corrections with provenance. Test mathematical structure and numerical examples, not just successful MathJax rendering.
5. **Rebuild all applicable rendering caches in the same repair.** Use `renderRow` and refresh `rendered_source_hash`/`rendered_at` with the final source fields, preserving answer keys, question identities, taxonomy, publication state, memberships, and history. Existing caches can otherwise continue displaying the old HTML.
6. **Publish in reviewed batches.** Save prior content, guard against concurrent edits, apply only reviewed fields, and verify saved fingerprints and browser rendering. Preserve M-00861's existing prompt until its source is complete.

A small stylesheet improvement can keep remaining recognized equation images inline while conversion work proceeds. It needs to cover stems, stimuli, options, and explanations, and to match equation markers rather than all images. The main repair should still normalize stored content; styling PNGs alone cannot produce matching MathJax fonts or scalable vector math.

No renderer fork keyed on `-DC` is needed. The existing shared renderer already displays the prepared normalized content correctly.

## Reproduction and checks

- `scripts/audit-dc-question-bank.ts` retrieves and hashes source records from a saved inventory; it has no database client.
- `scripts/analyze-dc-question-bank.ts` inventories formatting, screens conversion candidates, and checks source identities and answer evidence.
- `scripts/preview-dc-question-repairs.ts` prepares the eight local proposals, shared-renderer previews, preservation checks, and formula comparisons.
- Focused TypeScript checks for these three tools pass. Full-project type checking reaches four existing errors in `tmp/verify-question-repair-records.ts` (unresolved imports and one untyped parameter); the new tools introduce no remaining errors.
- The existing numerical-answer grader accepts all 12 official alternatives across the five questions with multiple distinct valid answers.
- Pilot checks (`tmp/dc-question-audit-2026-10-08/pilot-checks.json`, retained locally) and browser checks (`tmp/dc-question-audit-2026-10-08/browser-checks.json`, retained locally) retain the verification evidence.
- The production cohort remains 459 published questions, with no Broken flags. No database writes were performed during this investigation.
