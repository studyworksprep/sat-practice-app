// Prompt + tool schema for the admin "Generate lesson with AI" flow
// (app/api/admin/lessons/generate). Two layers:
//
//   - DEFAULT_LESSON_PROMPT_TEMPLATE — the pedagogy-side prompt an
//     admin can review/edit in the UI. A saved override lives in
//     ai_prompt_templates (name = LESSON_GEN_TEMPLATE_NAME); when no
//     row exists this code-side default applies. The template must
//     contain LESSON_INFO_PLACEHOLDER, which is replaced with the
//     admin's lesson brief at generation time.
//
//   - SYSTEM_PROMPT — the machine contract (block vocabulary, HTML
//     conventions, taxonomy names, tool-call discipline). Not
//     editable in the UI, so admins can tune pedagogy freely without
//     being able to break the output contract.
//
// The model returns the lesson through the return_generated_lesson
// tool; lib/admin/lessonGenMapper.ts converts that payload into
// lesson_blocks rows.

import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';

export const LESSON_GEN_MODEL = 'claude-opus-4-8';

export const LESSON_GEN_TEMPLATE_NAME = 'lesson_generation';

export const LESSON_INFO_PLACEHOLDER = '{{LESSON_INFO}}';

export const DEFAULT_LESSON_PROMPT_TEMPLATE = `Write a complete SAT-prep lesson draft based on the lesson brief below.

Structure:
- Open with a short, motivating introduction that says what the student will be able to do by the end.
- Teach the concept in small text sections, each covering one idea, with at least one fully worked example per major idea.
- After each major idea, insert a multiple-choice comprehension check. Wrong choices should reflect real mistakes students make, and the explanation should say why the right answer is right.
- Where a short video would genuinely help (a visual walkthrough, an animation), add a video placeholder describing what it should cover. Use these sparingly.
- End by suggesting 1-3 practice questions from the question bank that match the skill taught.

Tone: clear, encouraging, plainly worded, for a high-school student. Prefer short sentences and concrete numbers over abstraction.

Length: unless the brief says otherwise, aim for a lesson a student can finish in 10-20 minutes.

Lesson brief:
${LESSON_INFO_PLACEHOLDER}`;

// The exact domain/skill names the bank uses, rendered into the
// system prompt so question suggestions resolve against questions_v2.
const TAXONOMY_LINES = SAT_TAXONOMY.map(
  (d) => `- ${d.name}: ${d.skills.map((s) => s.name).join(' | ')}`,
).join('\n');

export const SYSTEM_PROMPT = `You are an expert SAT tutor and curriculum writer. You write complete, self-contained SAT-prep lessons as a sequence of typed blocks, returned through the \`return_generated_lesson\` tool.

Think the lesson through — plan the arc, work every example and check question yourself, verify your arithmetic — then call \`return_generated_lesson\` exactly once with the finished lesson. All output goes through that tool call; do not emit any other text.

## Block types

- \`text\` — a teaching section. \`html\` holds clean HTML.
- \`check\` — a multiple-choice comprehension check: \`prompt\`, 2-5 \`choices\` (plain text or inline LaTeX), \`correct_index\` (0-based), \`explanation\`. Solve the check yourself and confirm exactly one choice is correct. Wrong choices must come from real misconceptions or predictable slips, never filler.
- \`video\` — a placeholder for a video an admin will source later. Set \`video_topic\` to a precise description of what the video must show. Never invent a URL.
- \`question_suggestion\` — a pointer to a real practice question in the bank. Provide \`domain_name\` and \`skill_name\` copied EXACTLY from the taxonomy below, optionally \`difficulty\` (1 easy, 2 medium, 3 hard), and a one-sentence \`note\` saying why this practice fits here. Never invent question ids.

## Taxonomy (exact domain: skill names — copy them verbatim)

${TAXONOMY_LINES}

## HTML conventions (text blocks, prompts, explanations)

- Use simple semantic HTML: \`<p>\`, \`<ul>\`/\`<ol>\`/\`<li>\`, \`<strong>\`, \`<em>\`, \`<h3>\` for section headings inside a block, \`<table>\` with \`<th>\`/\`<td>\` for tabular data. No class, style, id, or event attributes. No \`<script>\`, \`<img>\`, \`<iframe>\`, or external resources.
- Math: NEVER use Unicode math characters. Write all variables, expressions, and numbers-in-prose as LaTeX inside \\( … \\) (inline) or \\[ … \\] (display). Examples: \\(2x + 1\\), \\(\\frac{3}{4}\\), \\(x^2\\), \\(\\sqrt{5}\\). Escape a literal dollar amount in prose as \\$9.25.
- Keep each text block focused on one idea — prefer several short blocks over one long one.

## Lesson-level fields

- \`title\`: short and specific (what skill, not "SAT Lesson").
- \`description\`: 1-2 sentences a student would read when deciding whether to open the lesson.

Always respond by invoking return_generated_lesson.`;

// Builds the user message for a revision turn: the admin reviewed
// the draft in the preview step and typed feedback. The current
// draft is replayed as its return_generated_lesson payload so the
// model revises in place instead of regenerating from scratch.
export function buildRevisionUserMessage(
  lessonInfo: string,
  currentLesson: unknown,
  feedback: string,
): string {
  return `You previously drafted the SAT-prep lesson below by calling \`return_generated_lesson\`. An admin has reviewed the draft and left feedback.

Original lesson brief:
${lessonInfo}

Current lesson draft (your previous return_generated_lesson payload):
${JSON.stringify(currentLesson, null, 2)}

Admin feedback:
${feedback}

Apply the feedback and call \`return_generated_lesson\` exactly once with the COMPLETE revised lesson — every block, not only the changed ones. Leave blocks the feedback does not touch unchanged, and keep every convention from the system prompt.`;
}

export const RETURN_GENERATED_LESSON_TOOL = {
  name: 'return_generated_lesson',
  description:
    'Return the finished lesson draft as an ordered list of typed blocks. Call exactly once. Strings may contain single-backslash LaTeX such as \\( x \\).',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short, specific lesson title.',
      },
      description: {
        type: 'string',
        description: '1-2 sentence student-facing description of the lesson.',
      },
      blocks: {
        type: 'array',
        minItems: 1,
        description: 'Ordered lesson blocks.',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['text', 'check', 'video', 'question_suggestion'],
            },
            // text
            html: {
              type: 'string',
              description: 'text blocks: clean semantic HTML with LaTeX math.',
            },
            // check
            prompt: {
              type: 'string',
              description: 'check blocks: the question text (may contain inline LaTeX).',
            },
            choices: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              maxItems: 5,
              description: 'check blocks: 2-5 answer choices.',
            },
            correct_index: {
              type: 'integer',
              minimum: 0,
              description: 'check blocks: 0-based index of the correct choice.',
            },
            explanation: {
              type: 'string',
              description: 'check blocks: why the correct answer is correct.',
            },
            // video
            video_topic: {
              type: 'string',
              description: 'video blocks: what the video must cover; an admin adds the URL later.',
            },
            // question_suggestion
            domain_name: {
              type: 'string',
              description: 'question_suggestion: exact domain name from the taxonomy.',
            },
            skill_name: {
              type: 'string',
              description: 'question_suggestion: exact skill name from the taxonomy.',
            },
            difficulty: {
              type: ['integer', 'null'],
              minimum: 1,
              maximum: 3,
              description: 'question_suggestion: optional difficulty (1 easy - 3 hard).',
            },
            note: {
              type: 'string',
              description: 'question_suggestion: one sentence on why this practice fits here.',
            },
          },
          required: ['type'],
        },
      },
    },
    required: ['title', 'blocks'],
  },
} as const;
