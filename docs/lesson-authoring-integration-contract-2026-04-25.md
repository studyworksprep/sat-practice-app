# Lesson Authoring Integration Contract (2026-04-25)

This file captures the current, code-backed contract for importing externally generated lesson plans.

## 1) Working lesson example

The JSON below matches the shape returned by `GET /api/lessons/[lessonId]` (`{ lesson, validation }`) and block shapes accepted by `PUT /api/lessons/[lessonId]/blocks`.

```json
{
  "lesson": {
    "id": "11111111-1111-1111-1111-111111111111",
    "author_id": "22222222-2222-2222-2222-222222222222",
    "title": "Equivalent Expressions Integration Example",
    "description": "Includes text, check+branching/rejoin, question_link, and desmos workflow blocks.",
    "visibility": "shared",
    "status": "draft",
    "created_at": "2026-04-25T00:00:00.000Z",
    "updated_at": "2026-04-25T00:00:00.000Z",
    "author_name": "Integration Bot",
    "topics": [
      { "domain_name": "Algebra", "skill_code": "A-SSE" }
    ],
    "blocks": [
      {
        "id": "intro_text",
        "lesson_id": "11111111-1111-1111-1111-111111111111",
        "sort_order": 0,
        "block_type": "text",
        "content": {
          "id": "intro_text",
          "html": "<p>Welcome to equivalent expressions.</p>"
        }
      },
      {
        "id": "check_branch_1",
        "lesson_id": "11111111-1111-1111-1111-111111111111",
        "sort_order": 1,
        "block_type": "check",
        "content": {
          "id": "check_branch_1",
          "prompt": "Are these expressions equivalent for all x?",
          "choices": ["Yes", "No"],
          "correct_index": 0,
          "explanation": "Equivalent expressions produce the same output for every valid x.",
          "on_correct_block_id": "correct_feedback",
          "on_incorrect_block_id": "incorrect_feedback",
          "rejoin_at_block_id": "rejoin_main"
        }
      },
      {
        "id": "correct_feedback",
        "lesson_id": "11111111-1111-1111-1111-111111111111",
        "sort_order": 2,
        "block_type": "text",
        "content": {
          "id": "correct_feedback",
          "html": "<p><strong>Correct.</strong> Nice work.</p>"
        }
      },
      {
        "id": "incorrect_feedback",
        "lesson_id": "11111111-1111-1111-1111-111111111111",
        "sort_order": 3,
        "block_type": "text",
        "content": {
          "id": "incorrect_feedback",
          "html": "<p>Not yet. Re-check your comparison.</p>"
        }
      },
      {
        "id": "rejoin_main",
        "lesson_id": "11111111-1111-1111-1111-111111111111",
        "sort_order": 4,
        "block_type": "question_link",
        "content": {
          "id": "rejoin_main",
          "question_id": "sat_rw_q_1001"
        }
      },
      {
        "id": "desmos_step_1",
        "lesson_id": "11111111-1111-1111-1111-111111111111",
        "sort_order": 5,
        "block_type": "desmos_interactive",
        "content": {
          "id": "desmos_step_1",
          "type": "desmos_interactive",
          "title": "Step 1: Enter original expression",
          "instructions_html": "<p>Type <strong>y=(x+1)(x-3)</strong> into Desmos.</p>",
          "caption_html": "<p>Look at the graph carefully.</p>",
          "initial_expressions": [],
          "calculator_options": {
            "expressions": true,
            "lockViewport": false,
            "sliders": true
          },
          "goal": {
            "type": "enter_expression",
            "required_count": 1
          },
          "validation": {
            "mode": "equivalent",
            "state_rules": {
              "min_expressions": 1,
              "max_expressions": 1,
              "require_visible_only": true
            },
            "expected": ["y=(x+1)(x-3)"],
            "test_values": [-2, 0, 2, 4],
            "tolerance": 0.000001
          },
          "feedback": {
            "success_message_html": "<p>Nice. That matches the target expression.</p>",
            "retry_message_html": "<p>That doesn’t seem to match yet. Check signs, parentheses, and exponents.</p>",
            "targeted_hints": [
              {
                "trigger": "missing_y_equals",
                "message_html": "<p>Start by typing <strong>y =</strong> before the expression.</p>"
              }
            ]
          },
          "progression": {
            "require_success": true
          },
          "workflow_id": "wf_eq_1",
          "step_index": 1,
          "total_steps": 2,
          "step_label": "Enter original"
        }
      },
      {
        "id": "desmos_step_2",
        "lesson_id": "11111111-1111-1111-1111-111111111111",
        "sort_order": 6,
        "block_type": "desmos_interactive",
        "content": {
          "id": "desmos_step_2",
          "type": "desmos_interactive",
          "title": "Step 2: Compare expressions",
          "instructions_html": "<p>Enter the original expression and one answer choice. Compare them.</p>",
          "initial_expressions": [],
          "goal": {
            "type": "multi_expression",
            "required_count": 2,
            "roles": ["original", "candidate"]
          },
          "validation": {
            "mode": "compare_expressions",
            "comparison": "equivalent",
            "test_values": [-2, 0, 2, 4],
            "tolerance": 0.000001,
            "state_rules": {
              "min_expressions": 2,
              "max_expressions": 2,
              "require_visible_only": true
            }
          },
          "feedback": {
            "success_message_html": "<p>These expressions match.</p>",
            "retry_message_html": "<p>These do not match yet.</p>",
            "targeted_hints": [
              {
                "trigger": "missing_second_expression",
                "message_html": "<p>Enter both expressions before checking.</p>"
              }
            ],
            "attempt_based_hints": [
              {
                "min_attempts": 2,
                "message_html": "<p>Try simplifying both expressions before comparing.</p>"
              }
            ],
            "reveal_solution_after_attempts": 4,
            "solution_html": "<p>Correct setup: enter exactly two expressions, then compare them.</p>"
          },
          "progression": {
            "require_success": true
          },
          "workflow_id": "wf_eq_1",
          "step_index": 2,
          "total_steps": 2,
          "step_label": "Compare",
          "inherit_from_previous_workflow_desmos": true
        }
      }
    ]
  },
  "validation": null
}
```

## 2) Block schemas

### Lesson (DB + API)
- DB table: `lessons(id, author_id, title, description, visibility, status, created_at, updated_at)`.
- API GET shape: `{ lesson: { ...lessonRow, author_name, blocks, topics }, validation }`.

### LessonBlock (DB + API)
- DB table: `lesson_blocks(id, lesson_id, sort_order, block_type, content, created_at)`.
- Accepted block types in validator/editor: `text | video | check | question_link | desmos_interactive`.
- API full-replace save (`PUT /api/lessons/[lessonId]/blocks`) body: `{ blocks: [{ block_type, content, sort_order? }, ...] }`.

### Text block content
```json
{ "id": "text_1", "html": "<p>...</p>", "explanation_html": "<p>optional</p>" }
```
- `html` is required for `kind:text` in template import.
- `explanation_html` is optional (import compiler passthrough).

### Check block content
```json
{
  "id": "check_1",
  "prompt": "Question text",
  "choices": ["A", "B"],
  "correct_index": 0,
  "explanation": "optional",
  "on_correct_block_id": "optional",
  "on_incorrect_block_id": "optional",
  "rejoin_at_block_id": "optional"
}
```

### Question link block content
```json
{ "id": "ql_1", "question_id": "<question-id-string>" }
```
- Runtime uses `question_id` to navigate to `/practice/${question_id}`.

### Desmos interactive block content
- See section 5 for exact shape/allowed values.

## 3) Workflow schema

Workflow metadata lives on block `content` (validator reads both top-level and content, but editor/templates place in `content`).

```json
{
  "workflow_id": "wf_1",
  "step_index": 1,
  "total_steps": 4,
  "step_label": "Enter original",
  "inherit_from_previous_workflow_desmos": false
}
```

Field contract:
- `workflow_id`: optional string.
- `step_index`: optional integer; validator warns if missing/invalid inside workflow.
- `total_steps`: optional integer; validator warns if missing/invalid/inconsistent.
- `step_label`: optional string (display only).
- `inherit_from_previous_workflow_desmos`: optional boolean; validator warns if true but no prior block in same workflow.

Defaults:
- No runtime defaults are injected automatically.
- Editor cleanup removes empty workflow fields and removes `inherit_from_previous_workflow_desmos` when false.

## 4) Branching schema

Branch metadata lives on block `content`:

```json
{
  "on_correct_block_id": "block_id_for_correct_path",
  "on_incorrect_block_id": "block_id_for_incorrect_path",
  "rejoin_at_block_id": "block_id_to_merge_paths"
}
```

Runtime behavior:
- On check submission, routing uses `on_correct_block_id` / `on_incorrect_block_id` with linear fallback.
- Active branch tracks chosen path and jumps to `rejoin_at_block_id` when continuing from chosen feedback block.

Validator behavior:
- Errors if branch targets/rejoin target do not exist.
- Warning if branch exists but no `rejoin_at_block_id`.

## 5) Desmos schema

Authoritative schema is enforced by `parseDesmosInteractiveContent(content)`.

```js
/**
 * @typedef {Object} DesmosInteractiveBlock
 * @property {string} id
 * @property {'desmos_interactive'} type
 * @property {string=} title
 * @property {string} instructions_html
 * @property {string=} caption_html
 * @property {{ id?: string, latex: string }[]} initial_expressions
 * @property {{ expressions?: boolean, lockViewport?: boolean, sliders?: boolean }=} calculator_options
 * @property {{ type: 'enter_expression' | 'multi_expression', required_count?: number, roles?: string[] | {name: string, count: number}[] }} goal
 * @property {{ mode: 'normalized' | 'equivalent' | 'state' | 'compare_expressions', comparison?: 'equivalent', expected?: string[], test_values?: number[], tolerance?: number, state_rules?: { min_expressions?: number, max_expressions?: number, require_visible_only?: boolean, must_include_variables?: string[], must_not_include_variables?: string[], allow_text_only_expressions?: boolean, required_sliders?: string[], require_slider_creation?: boolean, require_slider_movement?: boolean, slider_initial_values?: Record<string, number>, forbid_default_slider_values_on_submit?: boolean } }} validation
 * @property {{ success_message_html: string, retry_message_html: string, targeted_hints?: { trigger: 'missing_y_equals'|'uses_forbidden_variables'|'likely_parentheses_error'|'too_many_expressions'|'too_few_expressions'|'missing_required_slider'|'slider_not_moved'|'slider_still_default'|'missing_second_expression'|'expressions_not_comparable', message_html: string }[], attempt_based_hints?: { min_attempts: number, message_html: string }[], reveal_solution_after_attempts?: number, solution_html?: string }} feedback
 * @property {{ require_success: boolean }} progression
 */
```

Required fields (enforced):
- `instructions_html` (non-empty string)
- `initial_expressions` (array)
- `goal.type` in `enter_expression | multi_expression`
- `validation.mode` in `normalized | equivalent | state | compare_expressions`
- `feedback.success_message_html` and `feedback.retry_message_html`
- `progression.require_success` (boolean)

Conditional requirements:
- `validation.mode in [normalized, equivalent]` => `validation.expected` must be non-empty array.
- `validation.mode in [equivalent, compare_expressions]` => `validation.test_values` non-empty array.
- `validation.mode === compare_expressions` => `validation.comparison` only supports `equivalent`.

Goal types:
- `enter_expression`
- `multi_expression`

Validation modes:
- `normalized`
- `equivalent`
- `state`
- `compare_expressions`

State rules supported keys:
- `min_expressions`, `max_expressions`
- `require_visible_only`
- `must_include_variables`, `must_not_include_variables`
- `allow_text_only_expressions`
- `required_sliders`
- `require_slider_creation`
- `require_slider_movement`
- `slider_initial_values`
- `forbid_default_slider_values_on_submit`

Feedback schema:
- `success_message_html` (required)
- `retry_message_html` (required)
- `targeted_hints[]` with `trigger` + `message_html`
- `attempt_based_hints[]` with `min_attempts >= 1` + `message_html`
- `reveal_solution_after_attempts` integer >= 1
- `solution_html` string

Progression schema:
- `{ require_success: boolean }`

## 6) Template import schema

Active parser/compiler: `lib/lesson/template-import.mjs` (`parseLessonTemplateSpecText`, `compileLessonTemplateSpec`, `applyImportedBlocks`).

Top-level shape:
```json
{
  "title": "optional warning if missing",
  "description": "optional warning if missing",
  "blocks": [
    { "kind": "..." }
  ]
}
```

Supported `kind` values (active):
- `text`
- `desmos_enter_expression`
- `graph_comparison_workflow`
- `slider_workflow`
- `branching_question`
- `raw_block`

Required fields per kind:

### `text`
- required: `html`
- optional: `id`, `explanation_html`

### `desmos_enter_expression`
- required: `title`, `instructions_html`, `expression`
- optional: `id`, `expected_expression`, `test_values`, `require_success`

### `graph_comparison_workflow`
- required: `original_expression`, `candidate_expression`
- optional: `id`, `prompt_html`, `correct_html`, `incorrect_html`

### `slider_workflow`
- required: `expression`
- optional: `id`, `variables`, `prompt_html`

### `branching_question`
- required: `question_html`, `choices` (>=2), `correct_choice_id`
- `choices[]` entries require: `id`, `text`
- optional: `id`, `correct_html`, `incorrect_html`, `rejoin_html`, `explanation_html`

### `raw_block`
- required: `block_type`, `content`
- optional: `id`

Import insertion modes:
- `append`
- `insert_after_selected`
- `replace_all`

## 7) Template registry

Active registry: `lib/lesson/template-registry.mjs`.

Available registry templates (`lessonTemplates`):
- `graph_comparison_workflow`
- `slider_workflow`
- `branching_question`

Generator functions:

1. `createGraphComparisonWorkflow(params = {}, options = {})`
   - params optional:
     - `workflowId = 'graph_compare_1'`
     - `originalExpression = 'y=(x+1)(x-3)'`
     - `candidateExpression = 'y=x^2-2x-3'`
   - options optional:
     - `existingIds = []`

2. `createSliderWorkflow(params = {}, options = {})`
   - params optional:
     - `workflowId = 'slider_workflow_1'`
   - options optional:
     - `existingIds = []`

3. `createBranchingQuestionTemplate(params = {}, options = {})`
   - params optional:
     - `baseId = 'branching_q_1'`
     - `prompt = 'Which expression is equivalent?'`
     - `choices = ['Choice A', 'Choice B']`
     - `correctIndex = 0`
   - options optional:
     - `existingIds = []`

Related generator (not registry menu item):
- `createDesmosTemplate(kind)` in `lib/lesson/desmos-form-utils.mjs`
  - kinds: `enter`, `compare`, `slider_setup`, `slider_move`

## 8) Question integration

Lesson question integration uses `question_link` blocks only.

`question_link` content contract:
```json
{ "question_id": "<question-id>" }
```

Runtime behavior:
- Lesson viewer renders a button linking to `/practice/${question_id}`.

Question API source:
- `GET /api/questions/[questionId]` loads the real SAT question by question id from `questions` + `question_versions` + options/correct answer tables.

Optional explanation/guidance fields on lesson side:
- `question_link` has no built-in explanation/guidance fields in schema.

Screenshot/image support in `question_link` block:
- Not implemented.

## 9) Validation errors

Validator output shape (`validateLessonBlocks`):
```json
{
  "ok": false,
  "errors": [
    {
      "severity": "error",
      "code": "desmos_schema_invalid",
      "message": "desmos_interactive.instructions_html is required",
      "blockId": "bad_desmos",
      "path": "content",
      "suggestion": "Open the block editor and fix required desmos_interactive fields."
    }
  ],
  "warnings": [
    {
      "severity": "warning",
      "code": "branch_missing_rejoin",
      "message": "Branching block has no rejoin target.",
      "blockId": "branch_1",
      "path": "content.rejoin_at_block_id",
      "suggestion": "Set rejoin_at_block_id so the workflow merges back cleanly."
    }
  ],
  "summary": {
    "errorCount": 1,
    "warningCount": 1,
    "blockCount": 2,
    "workflowCount": 0
  },
  "workflowVisualization": []
}
```

Severities:
- `error`
- `warning`

Issues always include:
- `severity`, `code`, `message`, `blockId`, `path`, `suggestion`

## 10) Key file locations

- Lesson export (GET lesson with blocks/topics):
  - `app/api/lessons/[lessonId]/route.js` → `GET`
- Lesson block export/import (full block list):
  - `app/api/lessons/[lessonId]/blocks/route.js` → `GET`, `PUT`
- Lesson metadata import/update:
  - `app/api/lessons/[lessonId]/route.js` → `PUT`
- Template import parser/compiler:
  - `lib/lesson/template-import.mjs` → `parseLessonTemplateSpecText`, `compileLessonTemplateSpec`, `applyImportedBlocks`
- Template import UI entry point:
  - `app/admin/lessons/[lessonId]/editor/page.js`
- Template registry:
  - `lib/lesson/template-registry.mjs` → `lessonTemplates`, `createGraphComparisonWorkflow`, `createSliderWorkflow`, `createBranchingQuestionTemplate`
- Desmos schema + runtime validation:
  - `lib/lesson/desmos-interactive.mjs` → `parseDesmosInteractiveContent`, `validateDesmosSubmission`
- Lesson validation:
  - `lib/lesson/lesson-validation.mjs` → `validateLessonBlocks`
- Question integration path:
  - Lesson runtime link: `app/learn/[lessonId]/page.js` (`question_link`)
  - Question API: `app/api/questions/[questionId]/route.js`

Explicit "Not implemented" findings:
- Dedicated lesson export-to-file endpoint: Not implemented.
- Dedicated lesson import-from-file endpoint: Not implemented.
- `question_link` image/screenshot field support: Not implemented.
