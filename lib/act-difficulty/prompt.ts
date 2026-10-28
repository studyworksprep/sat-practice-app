// Prompt + tool contract for estimating ACT question difficulty.
//
// English and Reading questions arrive from the importer with no
// difficulty — the positional formulas in lib/act-import/difficulty.ts
// only fit Math and Science. This module rates them with Claude so the
// student launcher's difficulty filter and easy-first / hard-first
// ordering have something to work with (a null difficulty is excluded
// by `.in('difficulty', …)` and sorts as 0, i.e. "easiest").
//
// One request per passage group: the shared passage goes in once,
// followed by every question that hangs off it, and the model rates
// the whole set in a single return_difficulty_ratings tool call.
// Rating siblings together is not an optimisation — English stems are
// usually just a number ("<p>12.</p>") pointing at an underlined
// portion of the passage, so a question is only legible next to its
// passage and options, and relative difficulty inside a passage is
// easier to judge than absolute difficulty in isolation.
//
// Values are stored with difficulty_source = 'ai_estimate' (owner
// decision, 2026-10-10) and are meant to be replaced by
// performance-derived values once student data exists. Bump
// DIFFICULTY_PROMPT_VERSION whenever the system prompt or tool schema
// changes.

export const DIFFICULTY_MODEL = 'claude-opus-5-5';
export const DIFFICULTY_PROMPT_VERSION = 'act-difficulty-v1';

/** The tool returns the level as a string enum — the safest shape
 *  under strict tool use — and the parser converts it to 1–5. */
export const DIFFICULTY_LEVELS = ['1', '2', '3', '4', '5'] as const;

export const DIFFICULTY_SYSTEM_PROMPT = `You rate the difficulty of ACT practice questions on the 1–5 scale a test-prep platform uses to order and filter practice. Ratings decide which questions a student meets first ("easy first" / "hard first", difficulty filters), so consistency across the whole bank matters more than any single call.

You receive one group of questions that share a passage (or a single standalone question) as JSON after the passage HTML. For each question you see its stem, every answer option, and which option is the key.

The scale, calibrated to how often ACT test-takers answer correctly:
1 — Almost everyone gets it. One familiar rule, or a detail stated outright; the answer is visible on sight.
2 — Easy. One common rule or a direct lookup, with light distractors.
3 — Medium. Needs the surrounding sentences or a less common rule; an inference one step from the text; plausible distractors.
4 — Hard. Two options survive a careful read; rhetorical-purpose, transition, relevance, or paragraph-order questions that depend on paragraph-level logic; Reading inferences that synthesize separate parts of the passage; subtle punctuation or idiom.
5 — Hardest (roughly the top tenth). Fine distinctions between near-synonymous choices, "which choice best accomplishes…" with competing defensible options, tone or function inferences with near-miss distractors, or sentences that test several rules at once.

How to rate:
- English: find the question's underlined portion in the passage — it is marked <span class="qref" data-q="N">…</span>, where N is the question number, and "NO CHANGE" means keep that portion. Judge the rule being tested and how tempting the distractors are.
- Reading: judge how far the answer sits from the literal text (stated detail → paraphrase → inference → synthesis) and how close the distractors come.
- Use the whole scale. Within a passage group the ratings should spread out; do not give every question the same number. Rate on the merits — a question's position in the test or in the passage is not evidence of its difficulty.
- Give one sentence of reason per question that names the rule or the move the student has to make.

Call the return_difficulty_ratings tool exactly once with one rating for every question, using each question's "key" exactly as given. Do not reply with prose outside the tool call.`;

export const RETURN_DIFFICULTY_TOOL = {
  name: 'return_difficulty_ratings',
  description:
    'Return one difficulty rating per question in the group, keyed by the "key" value each question carries in the request.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      ratings: {
        type: 'array',
        description: 'One entry per question in the request, in any order.',
        items: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'The question key exactly as given in the request.',
            },
            difficulty: {
              type: 'string',
              enum: DIFFICULTY_LEVELS,
              description: '"1" (easiest) to "5" (hardest).',
            },
            reason: {
              type: 'string',
              description: 'One sentence naming the rule or move that sets the difficulty.',
            },
          },
          required: ['key', 'difficulty', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['ratings'],
    additionalProperties: false,
  },
} as const;
