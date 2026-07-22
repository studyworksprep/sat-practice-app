# Lesson JSON Authoring Guide (Import From JSON)

> **Status: Living document.** Last verified: 2026-07-22 (instructional quality standard, shared lesson calculator, and preset graphs). Verify against `lib/lesson/lesson-validation` when in doubt.

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
  per-answer paths and merge back (see §5).

Each entry in `blocks` is an object with a `kind` field that selects how it
compiles. The kinds below are the only ones allowed.

---

## 2. Instructional quality standard

A lesson should teach **one specific, reusable tool beneath an official SAT
skill**. It is not a chapter summary and should not try to introduce every
mathematically related idea. Define the tool narrowly enough that a learner
can recognize when to use it, carry it out, handle common variations, and
retrieve the process later without being prompted.

### 2a. Start with a tool-level objective

Before writing blocks, complete this sentence:

> By the end of this lesson, the learner can **[use a specific tool]** to
> **[solve or answer a specific class of SAT questions]**, including
> **[the most important variations]**.

Keep every block in service of that objective. Do not introduce adjacent
concepts merely because they are mathematically connected. For example, a
lesson about solving equations with x-intercepts does not need function
notation or a general treatment of functions.

Plan the lesson around:

- the exact student action or decision being taught;
- the prerequisite ideas the student must already know;
- two to four realistic variations or failure points;
- the evidence that will show the learner can use the tool independently.

### 2b. Use this learning sequence

For a full strategy lesson, use this sequence as the default. Combine steps
only when the content is genuinely simple.

1. **Invite a short exploration.** Give the learner something concrete to
   inspect, click, compare, or try before explaining everything.
2. **Check the observation.** Ask a question that can be answered directly
   from that exploration.
3. **Name and explain the idea.** Give the minimum definition or principle
   needed to make sense of what the learner just saw.
4. **Check the meaning.** Confirm the learner can connect the definition to
   a new but closely related example.
5. **State a short repeatable process.** Prefer three to five named steps.
6. **Model or guide one complete use of the process.** Keep the calculator,
   diagram, or other relevant evidence visible.
7. **Vary one feature at a time.** Examples include a different variable,
   exact versus decimal answers, one/two/no solutions, restrictions, or a
   requested intermediate quantity.
8. **Check each important variation after it has been taught or explored.**
9. **Require transfer.** Give a fresh problem without telling the learner
   every step or which answer is correct.
10. **End with retrieval.** Ask the learner to recall the process, decision
    rule, or sequence without looking back, then close with a concise summary.

This order matters. A knowledge check must never depend on information that
appears only after the check. A learner should be able to answer from a
guided exploration, a definition already provided, or a process already
modeled.

### 2c. Write for learning, not for a textbook

- Use direct, conversational language: “Click both intercepts” is better
  than “Identify all points at which the relation intersects the abscissa.”
- Address the learner as “you” and use short paragraphs and sentences.
- Introduce one new idea per slide. Break long explanations into a sequence
  of explanation, action, and check blocks.
- Prefer plain English before formal notation. Use technical vocabulary only
  when the learner needs the term, and define it immediately.
- Avoid unnecessary precision or scope. Do not introduce function notation,
  formal proof language, or a new representation unless it helps perform the
  tool being taught.
- Explain why a step works, but keep that explanation close to the action it
  justifies.
- Use images to explain unfamiliar interface controls or visual structures.
  The image must have useful alt text; the surrounding prose must still make
  the action understandable if the image does not load.

### 2d. Design SAT-authentic knowledge checks

Use checks to strengthen retrieval and diagnose a specific misconception,
not merely to add activity. For central ideas, prefer `allow_retry: true`, a
targeted `hint`, and a short confirming `explanation`.

Every check should satisfy all of these rules:

- The correct answer is supported by material the learner has already seen
  or by an exploration the learner has just completed.
- The question tests one identifiable idea or decision.
- Incorrect choices represent plausible student errors: reversing
  coordinates, losing a sign, using the wrong variable, stopping after one
  solution, confusing exact and approximate values, or performing the wrong
  transformation.
- Choices are parallel in format and similar in specificity. Avoid joke
  answers, obvious length clues, overlapping answers, and “all/none of the
  above” unless absolutely necessary.
- Vary the correct answer's position across checks. Do not default to the
  first choice. Before finalizing a lesson, distribute correct answers across
  the available positions and avoid an obvious repeating pattern. Whenever
  choices move, update `correct_index` so it still points to the correct one.
- Use four choices when imitating a normal SAT multiple-choice item, unless
  the learning purpose clearly calls for fewer.

**Do not use proofs, written justifications, or other constructed-response
work as prompts or distractors.** The SAT does not ask students to submit a
proof or written solution, so options such as “the question asks for a
written algebraic proof” are not authentic sources of difficulty.

The SAT can still make a calculator-friendly problem more demanding by
asking for a value that appears during a specified solution path rather than
asking for the final solution. Appropriate checks may ask the learner to:

- select the expression that results after getting zero on one side;
- identify a coefficient, constant, or parameter after rewriting an
  equation in the form requested by the problem;
- report the value of an intermediate quantity, such as the value inside a
  completed square, instead of the final value of the variable;
- choose which answer choice matches calculator decimals in exact form;
- determine how many distinct real solutions exist;
- translate a temporary calculator variable back to the variable used in
  the question;
- respect a domain, sign, or contextual restriction after finding possible
  solutions.

The difficulty should come from selecting and executing the right step, not
from pretending the SAT assesses a response format it does not use.

### 2e. Use feedback to produce another attempt

A retry hint should help the learner inspect the relevant evidence or redo
one step without giving away the answer. The success explanation should
connect the answer to the underlying idea.

```json
{
  "prompt": "After moving every term to the left, which expression should you graph?",
  "choices": ["\\(x^2-4x+1\\)", "\\(x^2+4x+1\\)", "\\(x^2+1\\)", "\\(4x\\)"],
  "correct_index": 0,
  "allow_retry": true,
  "hint": "Subtract \\(4x\\) from both sides and look at the left side.",
  "explanation": "Yes. The equation becomes \\(x^2-4x+1=0\\), so graph \\(x^2-4x+1\\)."
}
```

Avoid hints such as “Try again” or “Remember the rule” when a more targeted
nudge is possible. Avoid success messages that only say “Correct.”

### 2f. Use evidence-aligned learning mechanics intentionally

The block sequence should reflect these principles rather than relying on
passive explanation alone:

- **Manage cognitive load:** segment the process, remove notation and
  vocabulary outside the objective, and keep one main action per block.
- **Prompt generation before telling:** let the learner inspect a graph or
  attempt a bounded prediction before naming the rule, but provide enough
  guidance that the exploration is not guesswork.
- **Use worked-example fading:** model the entire process once, guide the
  next use, then require the learner to perform the transfer task with fewer
  prompts.
- **Practice retrieval:** use checks that require the learner to recall or
  apply the idea, including a delayed final check after intervening material.
- **Give immediate, actionable feedback:** identify the step to reconsider;
  do not simply mark an answer wrong or reveal the answer immediately.
- **Use contrast and variation:** change one important feature at a time so
  learners see what stays constant and what changes.
- **Pair words with useful visuals:** show the graph, control, or diagram
  being discussed. A decorative image does not count as instruction.
- **Gate true prerequisites:** use retry-until-correct or required Desmos
  validation when later blocks depend on the learner understanding the
  current step. Do not gate trivia or low-value details.

### 2g. Quality target for a complete lesson

A substantial tool lesson will often contain 15–40 short blocks, including:

- at least one learner-controlled exploration;
- checks after each major idea and important variation;
- one fully independent or gated Desmos task when graphing is part of the
  tool;
- a transfer problem that combines multiple steps;
- a final retrieval check and, optionally, a `lesson_complete` block.

This is a quality target, not a block quota. A shorter lesson is better than
padding; a longer lesson is appropriate only when each block performs a
distinct instructional job.

---

## 3. Block kinds — use these

### 3a. `text` — explanation, worked examples, headings, images

```json
{ "kind": "text", "html": "<p>Your content. Math like \\(x^2+1\\) renders.</p>" }
```

- `html` (**required**): an HTML string. Allowed tags: `p, h1–h6, ul, ol,
  li, strong, em, blockquote, a, img, br`. Keep it simple.
- Images: use an app-local path such as `<img src="/images/example.svg">`
  for assets committed under `public/images`, or an absolute HTTPS URL.
  Always include descriptive `alt` text and usually a `width`.
- Optional: `explanation_html`.

### 3b. `raw_block` — full control over any block type

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
  see **§5 Branching**.

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

**Desmos interactive (advanced)** — see §3c for the easy path. Full schema:
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

### 3c. Desmos convenience kinds (easier than raw_block)

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
`require_success`, `initial_state` (an opaque state captured by the lesson
editor), and `initial_expressions`.

**`graph_comparison_workflow`** and **`slider_workflow`** expand into a
multi-step Desmos sequence. Use only if you specifically want that flow:
```json
{ "kind": "graph_comparison_workflow", "original_expression": "y=(x+1)(x-3)", "candidate_expression": "y=x^2-2x-3" }
```
```json
{ "kind": "slider_workflow", "expression": "y=Ax+B" }
```
(Use uppercase parameter letters like `A`, `B` so Desmos makes sliders.)

### 3d. `branching_question` — send correct/incorrect answers different ways

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

### 3e. Calculator presentation on ordinary blocks

Desmos is available as a persistent scratch calculator on ordinary lesson
blocks by default. Add a top-level `calculator` object to a block spec to
change its visibility or load a premade graph. The importer copies this
object into the compiled block's content.

```json
{
  "kind": "text",
  "html": "<p>Explore the graph, then explain what its intercepts mean.</p>",
  "calculator": {
    "display": "open",
    "mode": "preset",
    "title": "Explore the intercepts",
    "initial_expressions": [
      { "id": "reference", "latex": "y=x^2-5x+6" }
    ],
    "editable": false,
    "resettable": true,
    "lock_viewport": false
  }
}
```

- `display`: `hidden`, `available`, or `open`. Default: `open` for every
  ordinary block. Interactive Desmos blocks also open automatically with
  their controlled activity state.
- `mode`: `scratch` or `preset`. Default: `scratch`.
- `title`: optional calculator-pane heading.
- `initial_expressions`: optional expression rows for JSON-authored presets.
  Add `"hidden": true` to an expression row when the learner should turn
  that graph on during an exploration.
- `initial_state`: optional complete state captured from Desmos in the visual
  lesson editor. Treat it as opaque; do not hand-edit it.
- `editable`: when false, hides the expression list while preserving graph
  tracing and exploration.
- `resettable`: controls the pane's Reset button. Default: true.
- `lock_viewport`: prevents panning and zooming when true.

Interactive Desmos blocks always open the controlled calculator and use an
isolated block or workflow state. Their state never shares expressions with
the learner's ordinary scratch calculator. To give an interactive block a
complete starting graph, add `initial_state` directly to its content (or use
the visual editor's **Capture starting graph** button).

#### Choose the calculator mode by the learner's job

| Learner's job | Use | Starting behavior |
| --- | --- | --- |
| Read, click, compare, zoom, or toggle an authored graph | `mode: "preset"` | Block-specific graph; keypad begins minimized |
| Freely calculate or test answer choices | `mode: "scratch"` | Persistent lesson scratchpad; keypad opens for input |
| Produce a required expression or graph that the lesson validates | `desmos_enter_expression` or `desmos_interactive` | Isolated controlled state; keypad opens and success can gate progress |

Use preset graphs to remove setup work only when setup is not the learning
goal. Use an interactive block when entering the expression is itself part
of the skill. Keep the instructions next to the graph precise: tell the
learner exactly what to click or type and what to notice.

#### Preset graph rules

- Preload evidence, not the learner's answer. A reference curve or comparison
  graph is appropriate; pre-entering every exact answer choice is not.
- When learners must compare decimal graph results with exact choices, open
  a scratch calculator and tell them which candidate values to type. They
  should generate the decimal evidence themselves.
- If several graphs should be inspected one at a time, start them with
  `"hidden": true`. First teach the learner that the colored circle at the
  left of an expression row toggles that graph. Do not write “turn on each
  graph” before explaining how.
- Use `editable: false` only for a reference display where changing or adding
  expressions would distract from the task. Keep it `true` when exploration
  is useful.
- Do not lock the viewport unless the instructional task depends on a fixed
  window. Learners often need to zoom or pan to verify whether an intercept
  exists outside the initial view.
- Give every preset a short action-oriented `title`, such as “Click both
  x-intercepts” or “Toggle and compare.”

Example with graphs initially off:

```json
"calculator": {
  "display": "open",
  "mode": "preset",
  "title": "Turn on one graph at a time",
  "initial_expressions": [
    { "id": "two", "latex": "x^2-5x+6", "hidden": true },
    { "id": "one", "latex": "(x-3)^2", "hidden": true },
    { "id": "none", "latex": "x^2+4", "hidden": true }
  ],
  "editable": true,
  "resettable": true,
  "lock_viewport": false
}
```

#### Teach calculator conventions explicitly

Do not assume a struggling learner knows Desmos interface conventions.
Explain a control immediately before the first task that requires it. When
helpful, add an annotated app-local image and a one-action practice block.

For equation-solving lessons, make these points explicit when relevant:

- Desmos can graph a bare expression such as `x^2-5x+6`; do not require
  `y=` when it adds no value.
- If the problem uses another variable, explain that the learner may replace
  it temporarily with `x` for graphing and must translate the final answer
  back to the original variable.
- A graph may provide decimals while the choices use radicals or fractions.
  Have the learner type the exact candidates into the scratch calculator and
  compare their decimal values.
- A crossing and a touch both create x-intercepts; no contact with the axis
  means no real solution in the displayed relationship. Encourage one zoom
  or pan check before concluding that no intercept exists.

---

## 4. Math formatting

Write math with LaTeX delimiters inside any text/HTML/prompt/choice field:
- Inline: `\( ... \)` — e.g. `The value \(x^2 + 1\) is positive.`
- Display (centered, own line): `\[ ... \]`

In JSON, every backslash must be escaped, so `\(` is written `\\(`:
```json
"prompt": "Solve \\(2x + 3 = 11\\) for \\(x\\)."
```
Math renders for the learner and in the editor preview. Desmos
*expressions* (the `expression` / `expected` fields) use plain calculator
syntax like `2x+1` or `y=2x+1`, **not** `\( \)` delimiters. Desmos can graph
a bare expression, so `y=` is optional unless the equation itself needs it.

---

## 5. Branching (optional: correct/incorrect paths)

Branching lets a question route correct and incorrect answers to different
blocks, then merge them back. Two ways:

- **Easiest:** use the `branching_question` kind (§3d). Prefer this.
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

## 6. Hard rules and gotchas

- **ids are optional.** The importer generates unique ids automatically. If
  you set an `id` on a block, keep it unique within the spec.
- **`correct_index` is 0-based.** Across a lesson, vary it among the valid
  choice positions; do not make every correct answer choice A.
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

## 7. Reference implementation and compact example

Use these full-quality references when planning a substantial lesson:

- `docs/lesson-template-specs/solving-equations-by-graphing-x-intercepts.json`
  demonstrates exploration before explanation, checks after instruction,
  common variations, preset and scratch calculator states, exact-choice
  comparison, an interface-control image, a gated transfer task, and final
  retrieval.
- `docs/lesson-template-specs/solving-equations-with-regression.json`
  demonstrates slower concept pacing across roughly 40 blocks. It previews
  new sections before introducing unfamiliar terms, teaches one important
  concept per block, defines vocabulary before checking it, uses explicit
  transitions and concrete process outlines to preserve the lesson's logic,
  bolds instructions and terms that students might skim, distributes correct
  answers across choice positions, fades from guided calculator work to
  independent transfer, and ends with a focused cumulative practice set.

Treat these as models for instructional decisions, not rigid templates. Match
the number and type of blocks to the tool being taught.

The smaller example below is copy-paste-ready and demonstrates the same
sequence without every possible variation:

```json
{
  "title": "Solve Linear Equations by Graphing",
  "description": "Use an x-intercept to solve a one-variable linear equation and report the answer with the original variable.",
  "blocks": [
    {
      "kind": "text",
      "id": "explore",
      "html": "<h2>Start with the graph</h2><p>The graph of \\(3x-12\\) is open. Click the point where it meets the x-axis. What x-value do you see?</p>",
      "calculator": {
        "display": "open",
        "mode": "preset",
        "title": "Click the x-intercept",
        "initial_expressions": [
          { "id": "starter", "latex": "3x-12" }
        ],
        "editable": true,
        "resettable": true,
        "lock_viewport": false
      }
    },
    {
      "kind": "raw_block",
      "id": "observe_check",
      "block_type": "check",
      "content": {
        "prompt": "The graph meets the x-axis at \\((4,0)\\). Which value makes \\(3x-12\\) equal \\(0\\)?",
        "choices": ["\\(x=4\\)", "\\(x=0\\)", "\\(x=-4\\)", "\\(x=12\\)"],
        "correct_index": 0,
        "allow_retry": true,
        "hint": "Use the horizontal coordinate of the intercept.",
        "explanation": "Right. At \\(x=4\\), the graph has height \\(0\\), so \\(3x-12=0\\)."
      }
    },
    {
      "kind": "text",
      "id": "explain_process",
      "html": "<h2>The graphing move</h2><p>An x-intercept is where a graph meets the x-axis, so its vertical coordinate is \\(0\\).</p><ol><li>Get zero on one side of the equation.</li><li>Graph the expression on the other side. A bare expression works; <strong>y=</strong> is optional.</li><li>Click the x-intercept and report its x-value.</li></ol>"
    },
    {
      "kind": "raw_block",
      "id": "rewrite_check",
      "block_type": "check",
      "content": {
        "prompt": "To solve \\(2x+5=17\\) with an x-intercept, which expression should you graph?",
        "choices": ["\\(2x-12\\)", "\\(2x+22\\)", "\\(2x+5\\)", "\\(17\\)"],
        "correct_index": 0,
        "allow_retry": true,
        "hint": "Subtract \\(17\\) from both sides so one side is zero.",
        "explanation": "Yes. Rewriting gives \\(2x-12=0\\), so graph \\(2x-12\\)."
      }
    },
    {
      "kind": "text",
      "id": "different_variable",
      "html": "<h2>Keep the original variable</h2><p>For \\(4t-20=0\\), temporarily graph \\(4x-20\\). Desmos uses x horizontally, but your final answer must still use \\(t\\).</p>",
      "calculator": {
        "display": "open",
        "mode": "preset",
        "title": "Let x stand in for t",
        "initial_expressions": [
          { "id": "variable_swap", "latex": "4x-20" }
        ],
        "editable": true,
        "resettable": true,
        "lock_viewport": false
      }
    },
    {
      "kind": "raw_block",
      "id": "variable_check",
      "block_type": "check",
      "content": {
        "prompt": "The graph of \\(4x-20\\) crosses at \\(x=5\\). What should you report for \\(4t-20=0\\)?",
        "choices": ["\\(t=5\\)", "\\(x=5\\)", "\\(t=-5\\)", "\\(t=20\\)"],
        "correct_index": 0,
        "allow_retry": true,
        "hint": "The x in Desmos was only standing in for the original variable.",
        "explanation": "Exactly. Translate the calculator result back to the original variable: \\(t=5\\)."
      }
    },
    {
      "kind": "desmos_enter_expression",
      "id": "transfer",
      "title": "Build the graph yourself",
      "instructions_html": "<p>Solve \\(5p+7=2\\). Get zero on one side, replace \\(p\\) with \\(x\\), and enter the expression you should graph.</p>",
      "expression": "5x+5",
      "expected_expression": "5x+5",
      "test_values": [-2, 0, 2],
      "require_success": true
    },
    {
      "kind": "raw_block",
      "id": "transfer_solution_check",
      "block_type": "check",
      "content": {
        "prompt": "Your graph crosses the x-axis at \\(x=-1\\). What is the solution to \\(5p+7=2\\)?",
        "choices": ["\\(p=-1\\)", "\\(x=-1\\)", "\\(p=1\\)", "\\(p=-5\\)"],
        "correct_index": 0,
        "allow_retry": true,
        "hint": "Translate the calculator's x-value back to the variable in the original equation.",
        "explanation": "Correct. The temporary graphing variable was x, but the original solution is \\(p=-1\\)."
      }
    },
    {
      "kind": "raw_block",
      "id": "retrieval",
      "block_type": "check",
      "content": {
        "prompt": "Without looking back, which sequence correctly solves an equation with an x-intercept?",
        "choices": [
          "Get zero on one side; graph the other side; find every x-intercept; report the values using the original variable.",
          "Graph only the original left side; use its y-intercept as the solution.",
          "Replace every number with x; use the graph's highest point.",
          "Graph both sides separately; report every point on either graph."
        ],
        "correct_index": 0,
        "allow_retry": true,
        "hint": "Think: zero, graph, intercept, original variable.",
        "explanation": "You have it. That sequence turns each x-intercept into a solution of the original equation."
      }
    },
    {
      "kind": "raw_block",
      "id": "finish",
      "block_type": "lesson_complete",
      "content": {
        "html": "<h2>You have a new SAT tool</h2><p>You can rewrite a linear equation, use a graph to find its solution, and translate the answer back to the original variable.</p>",
        "button_label": "Complete Lesson"
      }
    }
  ]
}
```

---

## 8. How to confirm it works

1. Admin → **Lessons → Import from JSON**. Paste the JSON. The page
   compiles and validates live and reports any errors before you import.
2. Import, open the lesson, and use **Preview as student** to step through
   every block—do not review only the editor cards.
3. Confirm the instructional sequence:
   - every check is answerable from earlier instruction or the immediately
     preceding exploration;
   - every major idea and variation is checked;
   - the transfer task requires the learner to do meaningful work;
   - the final retrieval check asks for the core process or decision rule.
4. Audit every answer choice for SAT authenticity. Remove proof, written-work,
   or other non-SAT response formats. Make each distractor traceable to a
   plausible mathematical or procedural error.
5. Verify all math delimiters render and every image loads with useful alt
   text. Check that no accidental function notation, terminology, or concept
   falls outside the lesson's stated objective.
6. Exercise every calculator block exactly as a learner would:
   - preset expressions and hidden/visible states are correct;
   - scratch and interactive blocks open ready for typing;
   - no answer the learner should generate is already entered;
   - Reset restores the intended starting graph;
   - a required interactive block accepts equivalent correct input, rejects
     a realistic wrong input, and gates Continue until success.
7. Preview at a normal laptop width and a narrow/mobile width. Confirm the
   lesson and calculator remain usable, the keypad is reachable, images fit,
   and important instructions are not hidden below a clipped panel.
8. Read the entire lesson aloud once. Shorten formal or repetitive sentences,
   define unfamiliar words, and make every instruction state a visible action
   and a purpose.
