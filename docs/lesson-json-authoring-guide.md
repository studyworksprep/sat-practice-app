# Lesson JSON Authoring Guide (Import From JSON)

> **Status: Living document.** Last verified: 2026-07-19 (added the Phase 3.2 optional Desmos hint/solution fields; expanded state_rules). Verify against `lib/lesson/lesson-validation` when in doubt.

This document tells you exactly how to produce a JSON "LessonTemplateSpec"
that the Studyworks admin **Lessons → Import from JSON** page accepts and
compiles into a fully functional lesson. Follow it literally.

The importer is the source of truth: `lib/lesson/template-import.mjs`
(parser/compiler) + `lib/lesson/lesson-validation.mjs` (validator). On
import, errors block the import; warnings do not.

> Related: **Lessons → Generate with AI** (`/admin/lessons/generate`)
> drafts a lesson from a free-form brief instead of a JSON spec. It
> emits text / check / video-placeholder / question_link /
> desmos_interactive blocks (plus figure and graph images rendered
> into text blocks) through its own mapper
> (`lib/admin/lessonGenMapper.ts`) and runs the same
> `validateLessonBlocks` gate before saving a draft.

---

## 1. Output format

Produce **one JSON object** and nothing else:

```json
{
  "title": "Lesson title",
  "description": "One sentence describing the lesson.",
  "blocks": [ /* ordered array of block specs */ ]
}
```

- `title` and `description` are recommended (missing → warning, not error).
- `blocks` is required and must be a non-empty array.
- Blocks render to the learner **top-to-bottom, one slide at a time**, in
  array order. A straight sequence is the default; questions can branch to
  per-answer paths and merge back (see §4).

Each entry in `blocks` is an object with a `kind` field that selects how it
compiles. The kinds below are the only ones allowed.

---

## 2. Block kinds — use these

### 2a. `text` — explanation, worked examples, headings, images

```json
{ "kind": "text", "html": "<p>Your content. Math like \\(x^2+1\\) renders.</p>" }
```

- `html` (**required**): an HTML string. Allowed tags: `p, h1–h6, ul, ol,
  li, strong, em, blockquote, a, img, br`. Keep it simple.
- Images: `<img src="https://...">` with an absolute URL.
- Optional: `explanation_html`.

### 2b. `raw_block` — full control over any block type

`raw_block` writes a block verbatim. Use it for knowledge-check questions,
video, and advanced Desmos. Shape:

```json
{ "kind": "raw_block", "block_type": "<type>", "content": { /* see below */ } }
```

`block_type` must be one of: `text`, `video`, `check`, `question_link`,
`desmos_interactive`, `lesson_complete`. The `content` object schemas:

**Knowledge check (interactive question)** — answered inside the lesson:
```json
{
  "kind": "raw_block",
  "block_type": "check",
  "content": {
    "prompt": "What is the slope of \\(y = 3x - 2\\)?",
    "choices": ["\\(-2\\)", "\\(2\\)", "\\(3\\)", "\\(\\tfrac{1}{3}\\)"],
    "correct_index": 2,
    "explanation": "The coefficient of \\(x\\) is the slope, so \\(3\\)."
  }
}
```
- `prompt` (required), `choices` (required, array of ≥2 strings),
  `correct_index` (required, **0-based** index into `choices`),
  `explanation` (optional, shown after answering).
- The learner picks an answer, sees the explanation inline, then clicks
  **Continue**. For a simple linear question, that's all you need. To send
  correct and incorrect answers down different paths, add branch fields —
  see **§4 Branching**.

**Retry-until-correct checks** — add `allow_retry` to keep the learner on
the question until they get it right, instead of revealing the answer on
the first try:
```json
{
  "kind": "raw_block",
  "block_type": "check",
  "content": {
    "prompt": "What is the slope of \\(y = 3x - 2\\)?",
    "choices": ["\\(-2\\)", "\\(2\\)", "\\(3\\)", "\\(\\tfrac{1}{3}\\)"],
    "correct_index": 2,
    "allow_retry": true,
    "hint": "The slope is the number multiplied by \\(x\\).",
    "explanation": "Right — the coefficient of \\(x\\) is the slope, so \\(3\\)."
  }
}
```
- `allow_retry` (optional boolean): when `true`, a wrong answer shows the
  `hint` and a **Try Again** button and lets the learner pick again
  **without** revealing the correct choice. The block reveals the answer
  and the `explanation` only once they answer correctly.
- `hint` (optional string, used only with `allow_retry`): the nudge shown
  after a wrong answer. If omitted, a generic "take another look" message
  is used. Use the `explanation` for the confirming message on success.
- A retry check also **gates Continue**: the learner can't advance until
  they answer correctly (the same way a `require_success` Desmos block
  gates). Don't combine `allow_retry` with branch fields — retry keeps the
  learner on the one block rather than routing them elsewhere.

**Video**:
```json
{ "kind": "raw_block", "block_type": "video",
  "content": { "url": "https://www.youtube.com/watch?v=VIDEO_ID", "caption": "Optional" } }
```
- YouTube and Vimeo URLs auto-embed; other URLs render as a link.

**Complete-lesson block** — the terminal block that ends the lesson:
```json
{ "kind": "raw_block", "block_type": "lesson_complete",
  "content": { "html": "<p>You finished — nice work!</p>", "button_label": "Complete Lesson" } }
```
- `html` (closing message) and optional `button_label` (default "Complete
  Lesson"). At runtime it shows the message and a button that finishes the
  lesson — no Continue button, and it's not treated as a dead end.
- **At most one per lesson, and it must be the very last block.** Optional
  — omit it for lessons that just end on their last content block.

**Question link** — embeds a real question from the question bank:
```json
{ "kind": "raw_block", "block_type": "question_link",
  "content": { "question_id": "<questions_v2 UUID>" } }
```
- `question_id` must be a real UUID from the question bank. **Omit this
  block type unless you have been given actual question UUIDs** — you
  cannot invent them.

**Desmos interactive (advanced)** — see §3 for the easy path. Full schema:
```json
{
  "kind": "raw_block",
  "block_type": "desmos_interactive",
  "content": {
    "type": "desmos_interactive",
    "title": "Graph the line",
    "instructions_html": "<p>Type <strong>y=2x+1</strong> into Desmos.</p>",
    "initial_expressions": [],
    "goal": { "type": "enter_expression", "required_count": 1 },
    "validation": {
      "mode": "equivalent",
      "expected": ["y=2x+1"],
      "test_values": [-2, 0, 2],
      "tolerance": 0.000001,
      "state_rules": { "min_expressions": 1, "max_expressions": 1, "require_visible_only": true }
    },
    "feedback": {
      "success_message_html": "<p>Nice — that matches.</p>",
      "retry_message_html": "<p>Check the slope and intercept and try again.</p>"
    },
    "progression": { "require_success": true }
  }
}
```
Required: `instructions_html`, `initial_expressions` (array, may be `[]`),
`goal.type` (`enter_expression` | `multi_expression`), `validation.mode`,
`feedback.success_message_html`, `feedback.retry_message_html`,
`progression.require_success` (boolean). Conditional rules:
- `mode` is `normalized` or `equivalent` → `expected` must be a non-empty
  array of LaTeX strings.
- `mode` is `equivalent` or `compare_expressions` → `test_values` must be a
  non-empty array of numbers.
- `mode` `state` checks the calculator state via `state_rules` only (no
  `expected` needed).
- When `progression.require_success` is `true`, the learner cannot continue
  until they enter a correct answer (they get retries).

**Optional fields** (all may be omitted; the schema above stays valid):

- `feedback.targeted_hints` — array of `{ "trigger": "...", "message_html":
  "<p>...</p>" }`. When a wrong attempt matches a trigger, its message is
  shown instead of the generic `retry_message_html`. Valid triggers:
  `missing_y_equals`, `uses_forbidden_variables`,
  `likely_parentheses_error`, `too_many_expressions`,
  `too_few_expressions`, `missing_required_slider`, `slider_not_moved`,
  `slider_still_default`, `missing_second_expression`,
  `expressions_not_comparable`.
- `feedback.attempt_based_hints` — array of `{ "min_attempts": N,
  "message_html": "<p>...</p>" }` (`min_attempts` ≥ 1): escalating nudges
  once the learner has failed at least N attempts.
- `feedback.reveal_solution_after_attempts` (integer ≥ 1) +
  `feedback.solution_html` — after that many failed attempts, the solution
  HTML is offered so the learner is never hard-stuck.
- `validation.state_rules` supports more than the three keys shown above:
  `must_include_variables`, `must_not_include_variables`,
  `allow_text_only_expressions`, `required_sliders`,
  `require_slider_creation`, `require_slider_movement`,
  `slider_initial_values` (map of name → number), and
  `forbid_default_slider_values_on_submit`.
- `goal.roles` — array labeling the expected expressions (e.g.
  `["original", "candidate"]` in the graph-comparison workflow). Rarely
  needed by hand; the convenience kinds set it for you.
- `validation.comparison` — only the value `"equivalent"` is accepted;
  used with `mode: "compare_expressions"`.

### 2c. Desmos convenience kinds (easier than raw_block)

**`desmos_enter_expression`** — ask the learner to type one expression:
```json
{
  "kind": "desmos_enter_expression",
  "title": "Enter the equation",
  "instructions_html": "<p>Type <strong>y=x^2</strong>.</p>",
  "expression": "y=x^2",
  "expected_expression": "y=x^2",
  "test_values": [-2, 0, 2],
  "require_success": true
}
```
Required: `title`, `instructions_html`, `expression`. Optional:
`expected_expression` (defaults to `expression`), `test_values`,
`require_success`.

**`graph_comparison_workflow`** and **`slider_workflow`** expand into a
multi-step Desmos sequence. Use only if you specifically want that flow:
```json
{ "kind": "graph_comparison_workflow", "original_expression": "y=(x+1)(x-3)", "candidate_expression": "y=x^2-2x-3" }
```
```json
{ "kind": "slider_workflow", "expression": "y=Ax+B" }
```
(Use uppercase parameter letters like `A`, `B` so Desmos makes sliders.)

### 2d. `branching_question` — send correct/incorrect answers different ways

The easiest way to branch. You give a question and per-answer feedback; the
importer builds the question plus a correct-feedback block, an
incorrect-feedback block, and a shared rejoin block, all wired together.

```json
{
  "kind": "branching_question",
  "question_html": "<p>Is \\(x^2 \\ge 0\\) for every real \\(x\\)?</p>",
  "choices": [ { "id": "yes", "text": "Yes" }, { "id": "no", "text": "No" } ],
  "correct_choice_id": "yes",
  "correct_html": "<p>Correct — a square is never negative.</p>",
  "incorrect_html": "<p>Not quite — try squaring a few negatives.</p>",
  "rejoin_html": "<p>Either way: squares are always \\(\\ge 0\\). Moving on.</p>"
}
```
Required: `question_html`, `choices` (array of `{ id, text }`, ≥2),
`correct_choice_id` (must equal one choice `id`). Optional: `correct_html`,
`incorrect_html`, `rejoin_html`, `explanation_html`. At runtime the learner
answers, clicks Continue, sees only the feedback for their answer, clicks
Continue again, and lands on the rejoin block — then the lesson continues.

---

## 3. Math formatting

Write math with LaTeX delimiters inside any text/HTML/prompt/choice field:
- Inline: `\( ... \)` — e.g. `The value \(x^2 + 1\) is positive.`
- Display (centered, own line): `\[ ... \]`

In JSON, every backslash must be escaped, so `\(` is written `\\(`:
```json
"prompt": "Solve \\(2x + 3 = 11\\) for \\(x\\)."
```
Math renders for the learner and in the editor preview. Desmos
*expressions* (the `expression` / `expected` fields) use plain calculator
syntax like `y=2x+1`, **not** `\( \)` delimiters.

---

## 4. Branching (optional: correct/incorrect paths)

Branching lets a question route correct and incorrect answers to different
blocks, then merge them back. Two ways:

- **Easiest:** use the `branching_question` kind (§2d). Prefer this.
- **Manual (raw_block):** put branch fields on a `check` block's `content`
  and give every target block a stable `content.id` that the branch fields
  reference **by content.id**:
  - `on_correct_block_id`  → the `content.id` of the correct-feedback block
  - `on_incorrect_block_id`→ the `content.id` of the incorrect-feedback block
  - `rejoin_at_block_id`   → the `content.id` of the block both paths merge into

  Order the blocks: the check first, then the correct-feedback block, then
  the incorrect-feedback block, then the rejoin block, then the rest of the
  lesson. Example:

  ```json
  { "kind": "raw_block", "block_type": "check", "content": {
      "id": "q1", "prompt": "Slope of \\(y=3x-2\\)?",
      "choices": ["2", "3", "-2"], "correct_index": 1,
      "on_correct_block_id": "q1_ok", "on_incorrect_block_id": "q1_no", "rejoin_at_block_id": "q1_join" } },
  { "kind": "raw_block", "block_type": "text", "content": { "id": "q1_ok",   "html": "<p>Right — the coefficient of x is the slope.</p>" } },
  { "kind": "raw_block", "block_type": "text", "content": { "id": "q1_no",   "html": "<p>The slope is the coefficient of x, which is 3.</p>" } },
  { "kind": "raw_block", "block_type": "text", "content": { "id": "q1_join", "html": "<p>Onward.</p>" } }
  ```

Rules for manual branching:
- Branch fields reference **`content.id`s, not top-level `id`s.** Give each
  target block a `content.id` and point the branch fields at those exact
  strings.
- Always set `rejoin_at_block_id` so the two paths merge; otherwise the
  learner falls through into the other path's feedback.
- A branch target that doesn't match any block's `content.id` silently
  falls back to linear (the next block in order).

---

## 5. Hard rules and gotchas

- **ids are optional.** The importer generates unique ids automatically. If
  you set an `id` on a block, keep it unique within the spec.
- **`correct_index` is 0-based.**
- **`choices` need at least 2 entries.**
- **Don't invent `question_id`s.** Only use `question_link` with real bank
  UUIDs you were given.
- **Valid `block_type` values:** `text`, `video`, `check`, `question_link`,
  `desmos_interactive`, `lesson_complete`. Nothing else. (Neither the
  compiler nor the validator flags an unknown type up front — it fails at
  save time against the database's CHECK constraint, with a much less
  helpful error. Stick to the list.)
- **`lesson_complete` is optional, at most one, and must be the last block.**
- **Escape JSON properly:** backslashes (`\\`), quotes (`\"`). The whole
  output must be valid JSON (no comments, no trailing commas).
- Keep HTML minimal and well-formed; tables and exotic tags may be
  normalized away if the lesson is later edited in the visual editor.

---

## 6. Complete example (copy-paste-ready)

```json
{
  "title": "Slope-Intercept Form",
  "description": "Read y = mx + b, check understanding, then graph a line in Desmos.",
  "blocks": [
    {
      "kind": "text",
      "html": "<h2>Slope-Intercept Form</h2><p>A line can be written as \\(y = mx + b\\), where \\(m\\) is the <strong>slope</strong> and \\(b\\) is the <strong>y-intercept</strong>.</p><p>For example, \\(y = 2x + 1\\) has slope \\(2\\) and crosses the y-axis at \\((0, 1)\\).</p>"
    },
    {
      "kind": "raw_block",
      "block_type": "check",
      "content": {
        "prompt": "In \\(y = -4x + 7\\), what is the slope?",
        "choices": ["\\(7\\)", "\\(-4\\)", "\\(4\\)", "\\(-7\\)"],
        "correct_index": 1,
        "explanation": "The slope is the coefficient of \\(x\\), which is \\(-4\\)."
      }
    },
    {
      "kind": "desmos_enter_expression",
      "title": "Graph the line",
      "instructions_html": "<p>Type the line with slope \\(2\\) and y-intercept \\(1\\): <strong>y=2x+1</strong>.</p>",
      "expression": "y=2x+1",
      "expected_expression": "y=2x+1",
      "test_values": [-2, 0, 2],
      "require_success": true
    },
    {
      "kind": "text",
      "html": "<p>Great work! You read slope-intercept form and graphed a line.</p>"
    }
  ]
}
```

---

## 7. How to confirm it works

1. Admin → **Lessons → Import from JSON**. Paste the JSON. The page
   compiles and validates live and reports any errors before you import.
2. Import, open the lesson, and use **Preview as student** to step through
   every block. Math should typeset, checks should show their explanation
   and require Continue, and Desmos blocks should accept the answer.
