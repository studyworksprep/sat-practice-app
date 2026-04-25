# Lesson Builder Feature Verification Audit (2026-04-25)

This audit verifies the requested lesson-builder capabilities against the current codebase.

## Results summary

- Fully implemented: 7 / 12
- Partially implemented: 4 / 12
- Not implemented: 1 / 12

## Detailed verification

1. **Desmos Interactive Block** — **Implemented**
   - `desmos_interactive` schema + parser exists.
   - Validation modes include `normalized`, `equivalent`, `state`, and `compare_expressions`.
   - Supports state-rule slider checks (`require_slider_creation`, `require_slider_movement`, slider default checks).
   - Supports targeted hints, attempt-based hints, solution reveal thresholds, and success-lock progression.
   - Runtime renders Desmos calculator and checks submissions.

2. **Validation System** — **Implemented**
   - Reusable lesson validation exists (`validateLessonBlocks`).
   - Handles block schema checks, desmos schema checks, workflow validation, branching target validation.
   - Emits structured errors/warnings with block id, path, and suggestion.
   - Covers compare-expression test-value checks, XY slider casing guard, and inherit-without-prior guard.
   - Also validates imported template specs with issue paths/suggestions.

3. **Guided Workflows** — **Partially implemented**
   - Workflow metadata fields (`workflow_id`, `step_index`, `total_steps`, `step_label`) are supported.
   - Editor and templates show workflow grouping/step indicators.
   - Inheritance metadata (`inherit_from_previous_workflow_desmos`) exists.
   - **Gap:** no runtime workflow context persistence/inheritance behavior found in learner runtime.

4. **Branching and Rejoin** — **Partially implemented**
   - Branching metadata fields exist and are validated (`on_correct_block_id`, `on_incorrect_block_id`, `rejoin_at_block_id`).
   - Templates auto-wire branching and rejoin paths.
   - **Gap:** learner runtime currently advances linearly (`goNext`) and does not navigate via branch targets.

5. **Internal Lesson Editor MVP** — **Implemented**
   - Three-panel layout: outline (left), JSON/form editor (center), preview/validation/debug tabs (right).
   - Can load/select/edit/add/duplicate/delete/move blocks.
   - Live validation + unsaved-change state + validation summary.
   - Saves via full-replace PUT flow.

6. **Structured Desmos Block Editor** — **Implemented**
   - Form editor for `desmos_interactive` exists with JSON fallback.
   - Includes sections for basic info, instructions, initial expressions, goal, validation, state rules, feedback/hints, progression, and workflow/context.

7. **Template System** — **Partially implemented**
   - Registry exists with graph comparison workflow, slider workflow, and branching question templates.
   - Has parameterization, unique ID generation, metadata auto-wiring, and branch/rejoin wiring.
   - **Gap:** dedicated registry entries for standalone `desmos_enter_expression` and `desmos_compare_expressions` are not in `lessonTemplates` (though Desmos form templates exist separately).

8. **Template Insertion UI** — **Implemented**
   - Editor includes Templates UI with template selection, parameter inputs, preview chips, and insertion after selected block.

9. **Template Import Mode** — **Implemented**
   - Paste/parse/validate/compile/import flow exists in editor.
   - Supports kinds: `text`, `desmos_enter_expression`, `graph_comparison_workflow`, `slider_workflow`, `branching_question`, `raw_block`.
   - Supports append / insert after selected / replace all + preview.

10. **Debug Mode** — **Partially implemented**
    - Learner debug mode includes block id/type, workflow metadata, validation mode, attempts, reason codes, next block, rejoin, expression count, detected sliders, inheritance flag.
    - Editor debug tab shows block metadata including goal type and branch fields.
    - **Gap:** learner debug panel does not explicitly show `goal type` label or branch target chosen as distinct fields.

11. **Seed / Fixture Support** — **Partially implemented**
    - Example import specs are included in editor defaults and docs template specs exist.
    - Template-generated sample lessons are supported by template insertion/import.
    - **Gap:** did not find explicit seeded "Equivalent Expressions Sandbox" or dedicated failure-path testing lesson seed in DB seed/migration scripts.

12. **Database Support** — **Not implemented**
    - Current migration for `lesson_blocks` still restricts `block_type` to `('text','video','check','question_link')` and does not include `desmos_interactive`.
    - Full-replace save behavior is present in API route.

## Recommendation

Priority fixes to fully match requested scope:
1. Add migration to update `lesson_blocks.block_type` constraint to include `desmos_interactive`.
2. Implement learner runtime branch routing using `on_correct_block_id` / `on_incorrect_block_id` / `rejoin_at_block_id`.
3. Implement workflow Desmos-state inheritance when `inherit_from_previous_workflow_desmos` is true.
4. Add explicit seed lesson fixtures (equivalent-expression sandbox and failure-path lesson).
