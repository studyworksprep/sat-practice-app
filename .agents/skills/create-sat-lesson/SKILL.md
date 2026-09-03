---
name: create-sat-lesson
description: Create importable, instructionally sound SAT lesson JSON for sat-practice-app from a user-supplied topic and rundown. Use when asked to create, author, draft, add, or revise an SAT lesson or lesson-template spec in this repository, especially when the result must follow the lesson authoring guide, draw on random existing lesson models, and pass the repository validators. Do not use for ordinary application work unrelated to lesson content.
---

# Create SAT Lesson

Turn the user's topic and rundown into a finished lesson-template JSON file in `sat-practice-app`. Preserve the user's requested scope while applying the repository's current authoring and validation rules.

## Workflow

### 1. Establish and update the repository

1. Work from the `sat-practice-app` repository root. If the current directory is elsewhere, locate the repository before continuing.
2. Treat the repository's remote default branch, currently `main`, as the required baseline unless the user explicitly requests another branch. A fully pulled feature branch is not an updated default-branch checkout.
3. In a local Git checkout, inspect the current branch, upstream, commit, and working-tree status before syncing.
4. Fetch `origin/main`, then confirm the fetched commit against the remote repository when a GitHub connector or other remote source is available.
5. Protect existing work:
   - If the tree is clean, switch to `main` and fast-forward it to `origin/main` before reading docs or counting lesson specs.
   - If the tree is dirty, do not switch, pull, stash, reset, clean, or overwrite changes. Prefer an existing clean `main` checkout or a separate clean worktree at `origin/main`; otherwise stop and report the blocker.
   - If `main` has diverged or cannot be fast-forwarded, stop and report the mismatch instead of authoring from a stale branch.
6. Verify that local `HEAD` equals the fetched `origin/main` commit. Only then count or select model lessons.
7. In a remote or connector-backed context, read from the current remote default branch and verify that the lesson-spec directory is from that branch.

### 2. Read the current lesson-authoring sources

1. Read `docs/README.md` to distinguish living documents from historical records.
2. Read `docs/lesson-json-authoring-guide.md` in full. Treat it as the primary authoring guide.
3. Read `docs/foundations-and-question-patterns.md` in full when deciding lesson scope, curriculum role, or whether the request is a foundation lesson or a question-pattern lesson.
4. Discover and read the other documents in `docs/` that are materially relevant to lesson authoring, template import, the lesson builder, or lesson validation. Read historical documents for context only; never let them override a living document or current code.
5. When documentation is ambiguous, outdated, or inconsistent, inspect these current implementations as the source of truth:
   - `lib/lesson/template-import.mjs`
   - `lib/lesson/lesson-validation.mjs`
   - Other lesson runtime or schema files directly implicated by the requested block types

### 3. Select three model lessons randomly

1. Enumerate the JSON files in `docs/lesson-template-specs/` before creating the new file.
2. Select three distinct files at random during this run; do not merely take the first three alphabetically. Use all available files if fewer than three exist.
3. Read each selected model in full and use them to learn structure, pacing, tone, block patterns, and level of detail.
4. Do not copy topic-specific content or mistakes from a model. Resolve conflicts in favor of the living guide and current code.
5. Keep the selected filenames for the final report.

### 4. Convert the rundown into a lesson plan

1. Extract the topic, requested coverage, constraints, prerequisite assumptions, and desired learner outcome from the user's rundown. Ask for clarification only when an essential requirement is genuinely missing.
2. Write a narrow tool-level objective using the form in the authoring guide.
3. Plan the learning sequence before writing JSON. Teach prerequisite information before testing it, vary one important feature at a time, include transfer, and finish with retrieval.
4. Preserve explicit requirements from the user's rundown. Do not expand the lesson into adjacent SAT concepts merely because they are related.

### 5. Author the lesson JSON

1. Create one importable JSON object and save it under `docs/lesson-template-specs/` using a descriptive kebab-case filename, unless the user specifies another destination.
2. Follow the block kinds and schemas in the current guide and importer exactly.
3. Make the content original, mathematically correct, SAT-authentic, direct, and conversational.
4. For a substantial strategy lesson, generally target 15–25 purposeful short blocks, but never pad a lesson to meet a quota.
5. Use plausible misconception-based distractors, correct zero-based answer indices, targeted retry hints, and explanations that reinforce the underlying idea. Where the SAT would ask for a typed value — a measurement check whose answer is one computed number — author a numeric-entry check (`input: "numeric"`, `answer`, optional `accept`/`tolerance`) instead of four numbers; see the authoring guide §3b.
6. Use Desmos only when it advances the objective. Make its expected expressions, test values, feedback, and progression rules internally consistent.
7. Never invent question-bank UUIDs, external assets, citations, or product capabilities. Omit `question_link` blocks unless real question IDs were supplied or verified.
8. Keep block IDs unique, references resolvable, branches rejoined where appropriate, and `lesson_complete` last when present.

### 6. Validate and revise

1. From the repository root, run:

   ```text
   node .agents/skills/create-sat-lesson/scripts/validate-lesson-spec.mjs <lesson-json-file>
   ```

2. Fix every parser, compiler, and lesson-validation error, then rerun until validation passes.
3. Review warnings individually and fix any warning that signals a real instructional, schema, navigation, or maintainability problem.
4. Manually audit the finished lesson for mathematical accuracy, correct answer indices, prerequisite order, SAT authenticity, useful feedback, valid branching, and alignment with the user's rundown.
5. Inspect the final diff and avoid changing unrelated files.

### 7. Report the result

Report:

- the created or updated lesson file;
- the three randomly selected model lessons;
- the validation result and any intentionally retained warnings;
- a concise summary of the lesson's objective and structure;
- any repository-sync limitation encountered.

Do not paste the entire JSON into the response unless the user asks for it.
