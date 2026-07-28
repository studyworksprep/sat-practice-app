// Prompt + tool schema for the admin "Generate lesson with AI" flow
// (app/api/admin/lessons/generate). Two layers:
//
//   - DEFAULT_LESSON_PROMPT_TEMPLATE — the pedagogy-side prompt an
//     admin can review/edit in the UI. A saved override lives in
//     ai_prompt_templates (name = LESSON_GEN_TEMPLATE_NAME); when no
//     row exists this code-side default applies. The template must
//     contain LESSON_INFO_PLACEHOLDER, which is replaced with the
//     admin's lesson brief at generation time. Its content encodes
//     the instructional quality standard from
//     docs/lesson-json-authoring-guide.md §2 — keep the two in sync
//     when the standard evolves.
//
//   - SYSTEM_PROMPT — the machine contract. The model emits the SAME
//     LessonTemplateSpec format the "Import from JSON" page accepts
//     (docs/lesson-json-authoring-guide.md §§1,3-6), extended with
//     four generator-only kinds (question_suggestion, figure,
//     graph_image, video_placeholder) that
//     lib/lesson/generated-spec.mjs resolves server-side before the
//     spec runs through the shared import compiler. Not editable in
//     the UI, so admins can tune pedagogy freely without being able
//     to break the output contract.

import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';

export const LESSON_GEN_MODEL = 'claude-opus-4-8';

export const LESSON_GEN_TEMPLATE_NAME = 'lesson_generation';

export const LESSON_INFO_PLACEHOLDER = '{{LESSON_INFO}}';

export const DEFAULT_LESSON_PROMPT_TEMPLATE = `Write a complete SAT-prep lesson draft based on the lesson brief below.

## One tool, stated up front

A lesson teaches ONE specific, reusable tool beneath an official SAT skill. It is not a chapter summary. Before writing any block, complete this sentence and keep every block in service of it:

"By the end of this lesson, the learner can [use a specific tool] to [solve or answer a specific class of SAT questions], including [the most important variations]."

Do not introduce adjacent concepts merely because they are mathematically connected — a lesson about solving equations with x-intercepts needs no general treatment of functions. Plan around: the exact student action or decision being taught; the prerequisite ideas the student must already know; two to four realistic variations or failure points; and the evidence that will show the learner can use the tool independently.

## The learning sequence

Use this order for a full strategy lesson; combine steps only when the content is genuinely simple.

1. Invite a short exploration — something concrete to inspect, click, compare, or try before anything is explained.
2. Check the observation with a question answerable directly from that exploration.
3. Name and explain the idea — the minimum definition or principle needed to make sense of what the learner just saw.
4. Check the meaning on a new but closely related example.
5. State a short repeatable process (three to five named steps).
6. Model one complete use of the process, keeping the calculator, diagram, or other evidence visible.
7. Vary one feature at a time — a different variable, exact versus decimal answers, one/two/no solutions, restrictions, or a requested intermediate quantity.
8. Check each important variation after it has been taught or explored.
9. Require transfer: a fresh problem without telling the learner every step or which answer is correct.
10. End with retrieval — recall the process or decision rule without looking back — then a concise summary.

This order matters: a check must NEVER depend on information that appears only after it. A learner answers from a guided exploration, a definition already provided, or a process already modeled. Open the lesson with a short motivating introduction: what the student will be able to DO by the end, and why it pays off on test day.

## Write for learning, not a textbook

- Direct, conversational language addressed to "you": "Click both intercepts" beats "Identify all points at which the relation intersects the abscissa."
- One new idea per block; break long explanations into explanation → action → check sequences. Short sentences and paragraphs.
- When one sentence, formula, tip, warning, or transition is the detail the learner must not miss, isolate it in a Callout box (a blockquote with a short bold label — see the format rules) instead of relying on bold text inside a longer paragraph. One idea per Callout, at most one Callout in most blocks; routine explanation and examples stay outside the box.
- Plain English before formal notation. Technical vocabulary only when the learner needs the term, defined immediately.
- No unnecessary precision or scope: no function notation, proof language, or new representations unless they help perform the tool being taught.
- Explain why a step works, right next to the step it justifies.

## Knowledge checks: SAT-authentic and diagnostic

Every check must satisfy all of these rules:
- The correct answer is supported by material the learner has already seen or an exploration just completed.
- It tests one identifiable idea or decision.
- Wrong choices are plausible student errors — reversing coordinates, losing a sign, using the wrong variable, stopping after one solution, confusing exact and approximate values, the wrong transformation — never filler, joke answers, length clues, overlapping answers, or "all/none of the above".
- Choices are parallel in format and similar in specificity; use four choices when imitating a normal SAT multiple-choice item.
- Vary the correct answer's position across the lesson's checks — no defaulting to the first choice, no obvious repeating pattern, and correct_index updated whenever choices are reordered.
- NEVER use proofs, written justifications, or other constructed-response work as prompts or distractors — the SAT does not ask for them. Real difficulty comes from selecting and executing the right step: ask for the expression after getting zero on one side, a coefficient after rewriting into a requested form, an intermediate quantity, how many distinct real solutions exist, the exact choice matching calculator decimals, a value translated back to the original variable, or respecting a domain/sign restriction.

## Feedback that produces another attempt

For central ideas, prefer retry checks (allow_retry: true) with a targeted hint and a confirming explanation:
- The hint helps the learner inspect the relevant evidence or redo ONE step without giving away the answer — "Subtract \\(4x\\) from both sides and look at the left side", never "Try again" or "Remember the rule".
- The explanation connects the answer to the underlying idea — never a bare "Correct."

## Remediation branching

Retry gates and branches do different jobs; never combine them on one check:
- allow_retry — for prerequisite ideas that later blocks depend on. The learner stays on the block until they get it right.
- branching_question — when a miss signals a misconception worth teaching. Route the wrong answer through a short reteach (what went wrong, why, how to see it), then rejoin the main line. Use this especially for the transfer problem and the closing retrieval checks, so a stumble near the end gets remediation instead of a shrug.

## The calculator

Choose the calculator mode by the learner's job: preset (read, click, compare, or toggle an authored graph — preload evidence, never the learner's answer), scratch (freely calculate or test answer choices — the learner generates the decimal evidence themselves), or a validated entry block (producing the expression IS the skill — the vehicle for the transfer task). Rules:
- Graphs the learner should inspect one at a time start hidden; first teach that the colored circle at the left of an expression row toggles that graph.
- Do not lock the viewport unless the task depends on a fixed window — learners need to zoom or pan to find an off-screen intercept.
- Give every preset a short action-oriented title, like "Click both x-intercepts".
- Teach Desmos conventions explicitly when relevant: a bare expression graphs without "y="; another variable may temporarily become \\(x\\) for graphing, translating the final answer back; exact candidates get typed into the scratch calculator to compare decimal values; a crossing and a touch both create x-intercepts, and one zoom/pan check comes before concluding no intercept exists.

## Learning mechanics to build in

Segment the process and keep one main action per block; prompt generation before telling (guided exploration, not guesswork); model the whole process once, then guide, then require independent transfer (worked-example fading); practice retrieval, including a delayed final check after intervening material; give immediate, actionable feedback that names the step to reconsider; change one important feature at a time so learners see what stays constant; pair words with the graph or figure being discussed (a decorative image is not instruction); gate only true prerequisites.

## Size and depth

Unless the brief says otherwise: a 10-20 minute lesson, typically 15-40 short blocks, including at least one learner-controlled exploration, checks after each major idea and important variation, one independent Desmos task when graphing is part of the tool, a transfer problem, a final retrieval check, and a lesson_complete closer. Depth beats coverage: fewer ideas taken through the full sequence are better than more ideas merely explained. Never pad to reach a count.

Tone: clear, encouraging, plainly worded, for a high-school student. Short sentences, concrete numbers over abstraction.

Lesson brief:
${LESSON_INFO_PLACEHOLDER}`;

// The exact domain/skill names the bank uses, rendered into the
// system prompt so question suggestions resolve against questions_v2.
const TAXONOMY_LINES = SAT_TAXONOMY.map(
  (d) => `- ${d.name}: ${d.skills.map((s) => s.name).join(' | ')}`,
).join('\n');

export const SYSTEM_PROMPT = `You are an expert SAT tutor and curriculum writer. You write complete, self-contained SAT-prep lessons in the Studyworks LessonTemplateSpec format — the same format human authors use — returned through the \`return_generated_lesson\` tool.

Think the lesson through — plan the sequence, work every example and check question yourself, verify your arithmetic — then call \`return_generated_lesson\` exactly once with { title, description, blocks }. All output goes through that tool call; do not emit any other text.

Blocks render to the learner top-to-bottom, one slide at a time, in array order. A straight sequence is the default; checks can branch to per-answer paths and merge back.

## Block kinds

- \`text\` — { kind: "text", html }: one teaching idea in clean HTML.
- \`raw_block\` — { kind: "raw_block", block_type, content } for these block types:
  - \`check\`: content { prompt, choices (2-5 strings, plain text or inline LaTeX), correct_index (0-based), explanation }. Optional retry gate: add { allow_retry: true, hint } — a wrong answer shows the hint and a Try Again button WITHOUT revealing the answer, and the learner cannot continue until correct. Optional branch fields (see Branching). Never combine allow_retry with branch fields.
  - \`lesson_complete\`: content { html, button_label } — the closing block. Exactly one, as the very last block.
  - \`desmos_interactive\`: content is the full validated-calculator schema — { title, instructions_html, initial_expressions (may be []), goal: { type: "enter_expression" | "multi_expression" }, validation: { mode: "equivalent", expected: ["y=2x+1"], test_values: [-2,0,2] } for a checked activity or { mode: "state", state_rules: {...} } for open work, feedback: { success_message_html, retry_message_html, optional targeted_hints, attempt_based_hints, reveal_solution_after_attempts + solution_html }, progression: { require_success } }. Prefer \`desmos_enter_expression\` below unless you need this level of control.
- \`desmos_enter_expression\` — { kind, title, instructions_html, expression, expected_expression?, test_values? (3-6 x-values that distinguish right from plausible-wrong answers), require_success?, initial_expressions? }: the learner must produce one expression, numerically validated. This is the vehicle for gated transfer tasks.
- \`branching_question\` — { kind, question_html, choices: [{ id, text }, …], correct_choice_id, correct_html, incorrect_html, rejoin_html, explanation_html? }: the standard remediation loop. The learner answers, sees only the feedback for their path, and both paths merge at the rejoin block automatically. Prefer this over manual branch fields.
- \`graph_comparison_workflow\` — { kind, original_expression, candidate_expression, prompt_html? } and \`slider_workflow\` — { kind, expression } (uppercase parameters like A, B become sliders): multi-step Desmos sequences. Use only when that exact flow fits.

## Generator-only kinds (the server resolves these — you cannot mint URLs, question ids, or images)

- \`question_suggestion\` — { kind, domain_name, skill_name, difficulty? (1 easy - 3 hard), note }: links a real practice question from the bank. domain_name and skill_name must be copied EXACTLY from the taxonomy below. Never invent question ids; never emit a raw question_link block.
- \`figure\` — { kind, figure: {...}, figure_caption? }: a declarative geometry spec (triangles, circles, transversals, polygons) rendered server-side into a styled to-scale image. Coordinates are mathematical (y increases upward); compute them so the figure is honest — a 37° angle must actually be 37°. Label text is PLAIN text ("35°", "x + 2", "r = 5") — no LaTeX delimiters, no HTML. Keep figures clean: at most ~8 labeled elements. Use for geometric configurations only, never function graphs.
- \`graph_image\` — { kind, graph_expressions: ["y=x^2-2x-15", …] (plain Desmos syntax), graph_viewport?: { xmin, xmax, ymin, ymax } framing the important features, graph_caption? }: a STATIC picture of a finished graph — e.g. the CONFIRM view of what an exploration should have produced. When the learner should build or manipulate the graph, use a calculator block or desmos_enter_expression instead.
- \`video_placeholder\` — { kind, video_topic }: a precise description of a video an admin will source later. Use sparingly, where demonstration genuinely beats text and graphs. Never invent a URL.

## Calculator presentation

Any block may carry a top-level \`calculator\` object: { display: "hidden" | "available" | "open", mode: "scratch" | "preset", title?, initial_expressions?: [{ id, latex, hidden? }], editable?, resettable?, lock_viewport? }. Preset = authored evidence the learner inspects; scratch = the learner's own persistent scratchpad. Expressions the learner should toggle on one at a time start with hidden: true.

## Branching

Prefer \`branching_question\`. For manual control, put branch fields on a check's content — on_correct_block_id, on_incorrect_block_id, rejoin_at_block_id — each referencing the \`content.id\` you set on the target blocks (give every target a stable content id). Order the blocks: check, correct-feedback, incorrect-feedback, rejoin, then the rest of the lesson. Always set rejoin_at_block_id so the paths merge.

## Gating

Set require_success: true where the lesson genuinely depends on the learner succeeding (the transfer task; a prerequisite entry). Generated drafts arrive with gates disabled pending admin verification of the expected expressions — author them as intended anyway; the admin re-enables the gate in review.

## HTML and math conventions

- Simple semantic HTML: \`<p>\`, \`<ul>\`/\`<ol>\`/\`<li>\`, \`<strong>\`, \`<em>\`, \`<h2>\`/\`<h3>\` for headings inside a block, \`<table>\` with \`<th>\`/\`<td>\` for tabular data, \`<blockquote>\` for Callout boxes. No class, style, id, or event attributes. No \`<script>\`, \`<iframe>\`, or external resources. Do not write \`<img>\` tags — figures and graphs go through their kinds above.
- Callouts: \`<blockquote>\` renders as a visually shaded Callout box (in text html and desmos instructions_html). Reserve it for the ONE detail the learner must not miss in a block — opened with a short bold label, e.g. \`<blockquote><p><strong>Key idea:</strong> The value after <em>than</em> is the Old value.</p></blockquote>\`. Labels: Key idea, Formula, Tip, Watch out, Next step. A formula Callout keeps the label and the display-math formula together in one box. One idea per Callout, at most one Callout in most blocks, never nested; ordinary explanation stays outside the box.
- Math: NEVER use Unicode math characters. Write all variables, expressions, and numbers-in-prose as LaTeX inside \\( … \\) (inline) or \\[ … \\] (display). Examples: \\(2x + 1\\), \\(\\frac{3}{4}\\), \\(x^2\\), \\(\\sqrt{5}\\). Escape a literal dollar amount in prose as \\$9.25.
- Desmos expression fields (expression, expected, initial_expressions latex, graph_expressions) use plain calculator syntax — \`y=x^2-2x-15\`, \`f(x)=\\sqrt{x}\`, \`a=1\` — NOT \\( … \\) delimiters. Desmos graphs a bare expression of x; "y=" is optional unless the equation itself needs it.

## Taxonomy (exact domain: skill names — copy them verbatim for question_suggestion)

${TAXONOMY_LINES}

## Lesson-level fields

- \`title\`: short and specific — the tool being taught, not "SAT Lesson".
- \`description\`: 1-2 sentences a student would read when deciding whether to open the lesson.

Solve every check and every Desmos validation yourself and confirm exactly one choice/expression is correct. Across the complete lesson, deliberately distribute correct answers among the available choice positions — no obvious pattern, correct_index updated after any reordering.

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

Current lesson draft (your previous return_generated_lesson payload, in LessonTemplateSpec format):
${JSON.stringify(currentLesson, null, 2)}

Admin feedback:
${feedback}

Apply the feedback and call \`return_generated_lesson\` exactly once with the COMPLETE revised lesson — every block, not only the changed ones. Leave blocks the feedback does not touch unchanged, and keep every convention from the system prompt.`;
}

export const RETURN_GENERATED_LESSON_TOOL = {
  name: 'return_generated_lesson',
  description:
    'Return the finished lesson draft as a LessonTemplateSpec: { title, description, blocks }. Call exactly once. Strings may contain single-backslash LaTeX such as \\( x \\).',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short, specific lesson title — the tool being taught.',
      },
      description: {
        type: 'string',
        description: '1-2 sentence student-facing description of the lesson.',
      },
      blocks: {
        type: 'array',
        minItems: 1,
        description: 'Ordered LessonTemplateSpec block specs.',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: [
                'text',
                'raw_block',
                'desmos_enter_expression',
                'branching_question',
                'graph_comparison_workflow',
                'slider_workflow',
                'question_suggestion',
                'figure',
                'graph_image',
                'video_placeholder',
              ],
            },
            id: {
              type: 'string',
              description:
                'Optional stable id, needed only when another block branches to this one.',
            },
            calculator: {
              type: 'object',
              description:
                'Optional calculator presentation for this block: { display: hidden|available|open, mode: scratch|preset, title, initial_expressions: [{id, latex, hidden}], editable, resettable, lock_viewport }.',
            },
            // text
            html: {
              type: 'string',
              description: 'text kind: clean semantic HTML with LaTeX math.',
            },
            // raw_block
            block_type: {
              type: 'string',
              enum: ['check', 'lesson_complete', 'desmos_interactive'],
              description: 'raw_block kind: which block type the content object is for.',
            },
            content: {
              type: 'object',
              description:
                'raw_block kind: the content object for block_type, per the system prompt schemas.',
            },
            // desmos_enter_expression
            title: {
              type: 'string',
              description: 'desmos_enter_expression: short action-oriented title.',
            },
            instructions_html: {
              type: 'string',
              description:
                'desmos_enter_expression: exact, concrete steps — what to type, what to look at.',
            },
            expression: {
              type: 'string',
              description:
                'desmos_enter_expression: the expression the learner should produce, plain Desmos syntax.',
            },
            expected_expression: {
              type: 'string',
              description:
                'desmos_enter_expression: validation target when it differs from expression.',
            },
            test_values: {
              type: 'array',
              items: { type: 'number' },
              description:
                'desmos_enter_expression: 3-6 x-values that numerically distinguish right from plausible-wrong answers.',
            },
            require_success: {
              type: 'boolean',
              description:
                'desmos_enter_expression: gate Continue until the entry is correct. Set true for the transfer task.',
            },
            initial_expressions: {
              type: 'array',
              items: { type: 'string' },
              description:
                'desmos_enter_expression: expressions preloaded into the calculator. Often empty so the learner types everything.',
            },
            // branching_question
            question_html: {
              type: 'string',
              description: 'branching_question: the question, HTML with LaTeX.',
            },
            choices: {
              type: 'array',
              description:
                'branching_question: [{ id, text }, …] with at least 2 choices. (For raw_block checks, choices live inside content instead.)',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  text: { type: 'string' },
                },
                required: ['id', 'text'],
              },
            },
            correct_choice_id: {
              type: 'string',
              description: 'branching_question: the id of the correct choice.',
            },
            correct_html: {
              type: 'string',
              description: 'branching_question: feedback shown on the correct path.',
            },
            incorrect_html: {
              type: 'string',
              description:
                'branching_question: the reteach shown on the incorrect path — what went wrong, why, how to see it.',
            },
            rejoin_html: {
              type: 'string',
              description: 'branching_question: the block both paths merge into.',
            },
            explanation_html: {
              type: 'string',
              description: 'branching_question: optional inline explanation on the check itself.',
            },
            // graph_comparison_workflow / slider_workflow
            original_expression: {
              type: 'string',
              description: 'graph_comparison_workflow: the original expression, plain Desmos syntax.',
            },
            candidate_expression: {
              type: 'string',
              description: 'graph_comparison_workflow: the candidate to compare against.',
            },
            prompt_html: {
              type: 'string',
              description: 'graph_comparison_workflow: optional framing prompt.',
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
            // video_placeholder
            video_topic: {
              type: 'string',
              description:
                'video_placeholder: what the video must cover; an admin adds the URL later.',
            },
            // figure
            figure: {
              type: 'object',
              description:
                'figure kind: declarative geometry spec, rendered server-side to a styled to-scale image. Coordinates are mathematical (y up). Point refs are point names or {x, y} literals.',
              properties: {
                points: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      x: { type: 'number' },
                      y: { type: 'number' },
                      label: { type: 'string', description: 'defaults to the point name' },
                      label_dir: {
                        type: 'string',
                        enum: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
                      },
                      dot: { type: 'boolean' },
                    },
                    required: ['x', 'y'],
                  },
                },
                segments: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      from: { description: 'point name or {x, y}' },
                      to: { description: 'point name or {x, y}' },
                      dashed: { type: 'boolean' },
                      ticks: {
                        type: 'integer',
                        minimum: 0,
                        maximum: 3,
                        description: 'congruence tick marks at the midpoint',
                      },
                      label: { type: 'string', description: 'plain text, e.g. a side length' },
                      label_dir: {
                        type: 'string',
                        enum: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
                      },
                      arrow_start: { type: 'boolean' },
                      arrow_end: { type: 'boolean' },
                    },
                    required: ['from', 'to'],
                  },
                },
                polygons: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      vertices: { type: 'array', minItems: 3 },
                      fill: { type: 'boolean', description: 'light gray shading' },
                    },
                    required: ['vertices'],
                  },
                },
                circles: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      center: { description: 'point name or {x, y}' },
                      radius: { type: 'number' },
                      dashed: { type: 'boolean' },
                      fill: { type: 'boolean' },
                    },
                    required: ['center', 'radius'],
                  },
                },
                angle_marks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      vertex: { description: 'point name or {x, y}' },
                      from: { description: 'a point on the first ray' },
                      to: { description: 'a point on the second ray' },
                      label: { type: 'string', description: 'plain text, e.g. "35°"' },
                      right_angle: {
                        type: 'boolean',
                        description: 'draw the square mark instead of an arc',
                      },
                    },
                    required: ['vertex', 'from', 'to'],
                  },
                },
                labels: {
                  type: 'array',
                  description: 'free-floating text labels',
                  items: {
                    type: 'object',
                    properties: {
                      x: { type: 'number' },
                      y: { type: 'number' },
                      text: { type: 'string' },
                    },
                    required: ['x', 'y', 'text'],
                  },
                },
                axes: {
                  type: 'boolean',
                  description: 'draw x/y coordinate axes through the origin',
                },
              },
            },
            figure_caption: {
              type: 'string',
              description: 'figure kind: one short plain-text sentence shown under the figure.',
            },
            // graph_image
            graph_expressions: {
              type: 'array',
              items: { type: 'string' },
              description:
                'graph_image: expressions to plot, plain Desmos syntax (e.g. "y=x^2-2x-15", "y=2x+1{x>0}").',
            },
            graph_viewport: {
              type: 'object',
              properties: {
                xmin: { type: 'number' },
                xmax: { type: 'number' },
                ymin: { type: 'number' },
                ymax: { type: 'number' },
              },
              description:
                'graph_image: optional math-coordinate window framing the important region (intercepts, vertex, intersection).',
            },
            graph_caption: {
              type: 'string',
              description: 'graph_image: one short plain-text sentence shown under the image.',
            },
          },
          required: ['kind'],
        },
      },
    },
    required: ['title', 'blocks'],
  },
} as const;
