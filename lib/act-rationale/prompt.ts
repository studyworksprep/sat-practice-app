// Prompt + tool contract for generating ACT rationales.
//
// One request per question. The model receives the stimulus, stem,
// every option with the keyed answer marked, any figure images by
// URL, and must call `return_rationale` exactly once. The style
// guide below is the product contract for what a student sees after
// answering an ACT question; keep it in sync with the SAT bank's
// rationale voice (docs/trap-catalog.md, lesson "solutions model the
// technique" rule) where the two overlap.
//
// Bump PROMPT_VERSION whenever the system prompt or tool schema
// changes so a later pass can tell which drafts predate the change.

export const RATIONALE_MODEL = 'claude-opus-5-5';
export const PROMPT_VERSION = 'act-rationale-v1';

export const RATIONALE_SYSTEM_PROMPT = `You write answer explanations ("rationales") for ACT practice questions. Each rationale is read by a high-school student right after they answer the question, often after getting it wrong. Your job is to make the keyed answer obviously right and each wrong choice obviously wrong, in the fewest words that still teach the move.

You receive one question as JSON: the section, category, optional stimulus (passage, figure, or data), the stem, and the answer options. Exactly one option is marked is_correct — that is the official key. Figures, when present, are attached as images before the JSON.

Write the rationale in this shape:

1. One sentence naming what the question tests (the rule, the concept, or the skill).
2. The solution path, in 2–5 short steps. Math: show the actual work using the same inline LaTeX delimiters as the stem, \\( ... \\), and finish with the keyed value. English: name the grammar/usage/rhetoric rule and quote the relevant words from the passage. Reading: quote or closely paraphrase the specific lines that support the answer. Science: point to the exact table rows, graph points, or experiment details that settle it.
3. One line per wrong option explaining the specific error it represents — a misread, a skipped step, a plausible-but-wrong rule, an answer to a different question. Each line starts with the option's letter in bold.

Rules:
- 80–180 words. Short sentences. No headings, no preamble, no "Great question".
- Refer to options only by the letters given (ACT alternates A–D and F–J; use the labels exactly as provided).
- Output clean HTML only: <p>, <ul>, <li>, <strong>, <em>, and inline math in \\( ... \\). No markdown, no <img>, no tables, no scripts or styles. Never restate the full stem or paste the whole passage.
- Never contradict the key. If, after working the problem, you believe the keyed option is actually wrong, still explain the keyed option as the official answer, set confidence to "low", and say in notes which option you believe is correct and why. Do not mention any doubt inside the rationale text itself.
- Do not invent passage text, data values, or figure details you cannot see. If a figure is required but not attached, work from what the stem states and set confidence to "low" with a note.

Call the return_rationale tool exactly once with your result. Do not reply with prose outside the tool call.`;

export const RETURN_RATIONALE_TOOL = {
  name: 'return_rationale',
  description:
    'Return the finished rationale for the question, the option letter it identifies as correct, and a confidence rating.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      rationale_html: {
        type: 'string',
        description: 'The rationale as clean HTML per the style guide.',
      },
      answer_letter: {
        type: 'string',
        description: 'The label of the option the rationale identifies as correct, exactly as given (e.g. "B" or "G").',
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: '"high" when the key is clearly right and the explanation is complete; "low" when you doubt the key or lacked a needed figure.',
      },
      notes: {
        type: 'string',
        description: 'Reviewer-facing note. Empty string unless confidence is below high; then say why.',
      },
    },
    required: ['rationale_html', 'answer_letter', 'confidence', 'notes'],
    additionalProperties: false,
  },
} as const;

/** Per-section reminder appended to the user turn. Short on purpose —
 *  the system prompt carries the contract; this just points at the
 *  section-specific evidence the rationale must cite. */
export function sectionReminder(section: string): string {
  switch (section) {
    case 'english':
      return 'English: quote the underlined or referenced words and name the rule (subject–verb agreement, punctuation, transitions, concision, relevance, etc.).';
    case 'reading':
      return 'Reading: cite the lines or phrases in the passage that support the key; wrong options usually distort, overreach, or come from the wrong part of the passage.';
    case 'science':
      return 'Science: name the table, figure, or experiment and the specific values or trend that settle it; wrong options usually misread an axis, a unit, or which study is asked about.';
    case 'math':
    default:
      return 'Math: show the computation in \\( ... \\) LaTeX and give the keyed value; wrong options usually come from a sign error, a skipped step, or answering a different quantity.';
  }
}
