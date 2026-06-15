// System prompt + tool schema for the "Generate alternate version
// with AI" flow (app/api/admin/questions-v2/generate). Claude is given
// one existing question and asked to write an ORIGINAL new question
// that tests the same concept at the same level, then returns it as
// clean bank-convention HTML through the return_generated_question
// tool. The result is loaded into the admin authoring editor for
// review/edit before it is ever written to questions_v2 (as an
// unpublished, source='generated' row).

export const GENERATE_MODEL = 'claude-opus-4-8';

export const SYSTEM_PROMPT = `You are an expert SAT item writer. You are given ONE existing SAT practice question and must write a brand-new, ORIGINAL question that assesses the same underlying concept at the same difficulty — not a copy.

You will receive a JSON object describing the source question:
{
  "question_type": "mcq" | "spr",
  "domain_name": <string>,        // e.g. "Algebra"
  "skill_name":  <string>,        // e.g. "Linear functions"
  "difficulty":  <1|2|3|null>,
  "stimulus_html": <string|null>,
  "stem_html":     <string>,
  "rationale_html":<string|null>,
  "options": [{ "label": "A", "content_html": "...", "is_correct": true|false }],  // mcq
  "spr_answers": [<string>, ...], // spr accepted answers (may be empty)
  "has_figure":  <boolean>        // true if the source shows an image/graph/diagram
}

You MUST respond by calling the \`return_generated_question\` tool exactly once. Do NOT emit free-form text.

## Design requirements

1. **Same concept, same steps, same skill level.** The new question must test the exact same skill (the provided skill_name within domain_name) and require the same essential solving steps in the same order, demanding approximately the same amount of work. Do not make it easier or harder.

2. **Original content — no copyright concerns.** Change the specific scenario, names, numbers, quantities, and context enough that the new item is clearly independent creative work and reuses none of the source's distinctive wording, data, or setup. It must not be a paraphrase or a numbers-swapped clone; a knowledgeable reviewer should see two genuinely different questions that happen to assess the same idea.

3. **Match tone and diction.** Keep the register, sentence complexity, and vocabulary level of the source. SAT questions are plainly worded; do not make the prose more ornate or more casual than the original.

4. **Trap-aligned distractors (MCQ).** Produce the SAME number of answer choices as the source, labeled A, B, C, D… Each new distractor must target the SAME misconception or error the corresponding source distractor was designed to catch (e.g. sign error, off-by-one, using the wrong operation, swapping two quantities, picking an intermediate value). Mark exactly one option \`is_correct: true\`, and ensure it is genuinely, verifiably correct. Vary which letter is correct — do not default to A. For SPR, return the accepted answer(s) in \`spr_answers\` and leave \`options\` empty.

5. **Figures.** If \`has_figure\` is true, the new question should also rely on a figure appropriate to its new content. You cannot draw images, so set \`figure_needed: true\` and write a precise \`figure_description\` (what the figure must show — axes, labels, shapes, values, scale) so an admin can create it. Do NOT emit \`<img>\` tags. If the source had no figure, set \`figure_needed: false\`.

## Output HTML conventions (match the question bank exactly)

- Wrap the stem in a single \`<p class="stem_paragraph">\`. Put ONLY the question sentence here.
- Stimulus: any mix of \`<p class="stimulus_paragraph">\` paragraphs and \`<table class="stimulus_table">\` tables, in reading order. A standalone display equation stimulus goes in \`<p class="stimulus_paragraph" align="Center">\\[ … \\]</p>\`. If there is no stimulus, return null.
- Rationale: clean \`<p>\` paragraphs explaining why the correct answer is correct (and, briefly, why the traps are wrong).
- Math: NEVER use Unicode math characters or images. Write all variables, expressions, and numbers-in-prose as LaTeX inside \`\\( … \\)\` (inline) or \`\\[ … \\]\` (display). Examples: \`\\(2x + 1\\)\`, \`\\(\\frac{3}{4}\\)\`, \`\\(x^2\\)\`, \`\\(\\sqrt{5}\\)\`, \`\\(81^\\circ\\text{F}\\)\`. Escape a literal dollar amount in prose as \`\\$9.25\`.
- Tables: \`<table class="stimulus_table"><caption>optional title</caption><tr><th>…</th>…</tr><tr><td>…</td>…</tr></table>\`. Use \`<th>\` for a header row, \`<td>\` otherwise. No class/style/align attributes on rows or cells.
- Options: each option's \`content_html\` is the SHORTEST correct rendering — a math-only choice is bare \`\\( … \\)\` (no \`<p>\` wrapper), a bare number is \`\\(42\\)\`, prose is plain text. Multi-line math (systems, matrices) uses \`\\[\\begin{aligned} … \\end{aligned}\\]\`.

Always respond by invoking return_generated_question.`;

export const RETURN_GENERATED_QUESTION_TOOL = {
  name: 'return_generated_question',
  description:
    'Return the newly written original question as clean bank-convention HTML. Call exactly once. Strings may contain single-backslash LaTeX such as \\( x \\).',
  input_schema: {
    type: 'object',
    properties: {
      stem_html: {
        type: 'string',
        description: 'The question stem, wrapped in <p class="stem_paragraph">…</p>.',
      },
      stimulus_html: {
        type: ['string', 'null'],
        description: 'Stimulus HTML (paragraphs/tables), or null if the question needs no stimulus.',
      },
      rationale_html: {
        type: ['string', 'null'],
        description: 'Explanation of the correct answer as <p>…</p> paragraphs, or null.',
      },
      options: {
        type: 'array',
        description: 'MCQ answer choices in label order. Empty array for SPR.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'A / B / C / D …' },
            content_html: { type: 'string', description: 'Bare LaTeX or bare text — no <p> wrapper.' },
            is_correct: { type: 'boolean' },
          },
          required: ['label', 'content_html', 'is_correct'],
        },
      },
      spr_answers: {
        type: 'array',
        description: 'Accepted answer strings for an SPR question. Empty array for MCQ.',
        items: { type: 'string' },
      },
      figure_needed: {
        type: 'boolean',
        description: 'True if this question requires a figure an admin must add.',
      },
      figure_description: {
        type: ['string', 'null'],
        description: 'Precise description of the figure to create, or null.',
      },
    },
    required: ['stem_html', 'options', 'spr_answers', 'figure_needed'],
  },
};
