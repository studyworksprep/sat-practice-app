# Content Layer Separation Analysis

## Executive Summary

The good news: **the codebase is almost entirely source-agnostic already.** The application code never filters, gates, or branches on where a question came from. Separating the content layer to support original questions alongside (or replacing) College Board content requires minimal structural changes.

---

## Current State: How Questions Flow Through the System

### Data Model

```
questions (id, source, source_external_id, question_id, status, is_broken)
    ├── question_versions (stem_html, stimulus_html, rationale_html, question_type)
    │       ├── answer_options (ordinal, label, content_html)
    │       └── correct_answers (correct_option_id, correct_text)
    └── question_taxonomy (program, domain_code, domain_name, skill_code, skill_name, difficulty, score_band)
```

### Key Finding: The `source` Column Is Unused in Application Code

The `questions.source` column (default `'collegeboard'`) exists in the schema but is **never queried, filtered, or displayed** anywhere in the application code. Specifically:

- **`/api/questions` (question list)**: Queries `questions` joining `question_taxonomy` and `question_status`. Selects only `id`, `question_id`, `is_broken`. Never touches `source`.
- **`/api/questions/[id]` (question detail)**: Fetches `source_external_id`, `is_broken`, `broken_by`, `broken_at` from `questions`. The `source_external_id` is displayed as a debug label in the UI, but `source` itself is not fetched.
- **Practice tests**: Route through `practice_test_module_items` → `question_versions`. No source filtering.
- **Attempts/progress**: The `attempts.source` column tracks *where the attempt came from* (practice vs practice_test vs review), NOT the question source. Completely unrelated.
- **RLS policies**: No policy references `questions.source`. All access is gated by user role and ownership.
- **RPC functions**: `set_question_broken` and `increment_version_accuracy` are source-agnostic.
- **Taxonomy**: `question_taxonomy.program` could distinguish sources (currently all SAT), but nothing filters on it.

### Where College Board Content Is Actually Coupled

1. **The question content itself** — `stem_html`, `stimulus_html`, `rationale_html` in `question_versions`, and `content_html` in `answer_options` contain College Board copyrighted text.

2. **`source_external_id`** — References College Board's internal IDs. Displayed in the practice UI (`app/practice/[questionId]/page.js:1357`) and teacher review (`app/teacher/review/[questionId]/page.js:457`) as a debug/reference label.

3. **`parseBluebookHtml.js`** — A client-side parser for importing results from College Board's Bluebook practice test exports (mypractice.collegeboard.org). Used in the teacher dashboard for importing student scores.

4. **A saved Bluebook HTML file** — `public/MyPractice - SAT Practice 11 - February 21, 2026 - Details.htm` sits in the public directory.

5. **Staging tables (`stg_*`)** — Used for importing College Board question data. These are ETL/admin tables, not user-facing.

6. **`question_id` text field** — Appears to use a College Board naming convention (displayed in filters/lists). This is cosmetic.

### What's Already Generic

- **Taxonomy structure**: `domain_code`, `domain_name`, `skill_code`, `skill_name`, `difficulty` (1-3), `score_band` — these map to SAT content specifications, which are *publicly documented*. The taxonomy itself is not copyrighted; it's how the College Board categorizes skills. Original questions can use the same taxonomy.
- **Question types**: `mcq` (multiple choice) and `spr` (student-produced response) are generic formats.
- **Score conversion**: Based on correct counts per module, not tied to specific questions.
- **Adaptive routing**: Based on module performance thresholds, not question identity.
- **All analytics/progress**: Track by question ID, not by source.

---

## What Needs to Change

### Tier 1: Minimal Changes (Support Mixed Sources)

These changes let you add original questions alongside existing ones with no disruption:

**A. Nothing in the core application code needs to change.** Original questions would use the exact same tables (`questions`, `question_versions`, `answer_options`, `correct_answers`, `question_taxonomy`) with:
- `questions.source` = `'original'` (or your brand name) instead of `'collegeboard'`
- `questions.source_external_id` = your own ID scheme or null
- Same taxonomy codes (same `domain_code`, `skill_code`, `difficulty` values)
- Same `question_type` values (`mcq`, `spr`)

**B. Update `question_availability`** — This precomputed table counts questions by domain/skill/difficulty. After adding original questions, re-run the population query (it's a manual INSERT...ON CONFLICT in the migrations, not a trigger).

**C. Optional: Add a `source` filter to `/api/questions`** — If you want users or admins to filter by source. Currently unnecessary since the app treats all questions identically.

### Tier 2: Monetization Gating (If Selling Original Content)

If original questions are the paid tier and CB questions stay free:

**A. Add a `is_premium` boolean to `questions` or `question_taxonomy`** — Simpler than filtering by source. Gate access in the `/api/questions/[id]` route based on subscription status.

**B. Modify the questions list API** — Add a filter or flag so the frontend can show premium questions as locked/teaser.

**C. Middleware or API-level subscription check** — Before returning `stem_html`, `rationale_html`, and `answer_options`, verify the user has an active subscription. Return metadata (domain, difficulty, skill) but not content for free users.

### Tier 3: Full Content Separation (If Removing CB Content)

If you want to eventually remove College Board content entirely:

**A. Build a question authoring interface** — Or use a bulk import script. The staging tables (`stg_questions_new`, `stg_question_versions_new`, `stg_answer_options_new`, `stg_correct_answers_new`) already define the import format.

**B. Create original practice tests** — New rows in `practice_tests`, `practice_test_modules`, `practice_test_module_items` pointing to original question versions.

**C. Remove or archive CB-specific artifacts:**
- Delete the saved Bluebook HTML from `/public/`
- `parseBluebookHtml.js` can stay (it imports student *results*, which is fair use of their own data)
- Clean up staging tables if no longer needed

**D. Update `question_availability`** after the content swap.

---

## Architectural Diagram: Current vs. Future

```
CURRENT (all College Board):
  questions (source='collegeboard') → question_versions → answer_options
                                                        → correct_answers
                                   → question_taxonomy

FUTURE (mixed sources, same schema):
  questions (source='collegeboard') ─┐
  questions (source='original')    ──┤→ question_versions → answer_options
  questions (source='partner_x')   ──┘                    → correct_answers
                                      → question_taxonomy (same skill codes)

  [No schema changes needed — just new rows]
```

---

## Effort Estimate

| Change | Effort | Files Touched |
|--------|--------|---------------|
| Add original questions to existing tables | None (just INSERT data) | 0 |
| Re-run `question_availability` population | Trivial | 1 migration |
| Add `source` filter to question list API | Small | 1 file (`/api/questions/route.js`) |
| Add `is_premium` gating for monetization | Medium | 2-3 files (API route + middleware + frontend indicator) |
| Build question authoring/import tool | Medium-Large | New admin page + API route |
| Remove CB content entirely | Data operation | 0 code files (SQL only) |

---

## Bottom Line

Your codebase accidentally did the right thing: **it never hardcoded dependencies on College Board as a source.** The content layer is already generic — questions are just rows with HTML content, taxonomy codes, and answer options. Adding original questions is literally just inserting new rows. The only real work is *creating the content itself* and adding subscription gating if you want to differentiate free vs. paid questions.
