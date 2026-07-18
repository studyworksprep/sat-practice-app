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

Teaching philosophy: students remember what they generate, not what they are handed. For every major idea, the student predicts and explores BEFORE being told. Direct explanation comes last, as confirmation — never first.

Structure each major idea as a 4-step arc:

1. PREDICT — open with a concrete problem or question the student commits to before anything is explained. Use a check block framed as a prediction ("Before we graph it: what do you think ...?"). Wrong choices are the guesses a smart beginner would actually make. It's fine for most students to get this wrong — the explanation should welcome the miss and set up the exploration, without giving the whole idea away.

2. EXPLORE — have the student DO something and observe the result before the idea is stated. For anything graphable, use a desmos_activity block (the calculator is embedded right in the lesson) with exact instructions: what to type, what to look at. Otherwise a small case worked by hand. Ask them to look for the pattern and form the rule in their own words. A short check can ask what they observed.

3. CONFIRM — only now state the principle plainly and completely: name it, connect it to what they just saw, and include one fully worked example with the final answer AND a verification step (e.g., substitute the solution back in and show it gives 0). Clean, direct exposition belongs here, at the END of the arc. If the solution invents a new object (like introducing y to graph an expression of x), acknowledge the move — don't act like it was always there. If the technique only works in a special form (e.g., the equation already equals 0), state the general rule or explicitly flag that the general case is coming.

4. CHECK — a comprehension check on a NEW example, not the one just worked. Wrong choices reflect real mistakes; the explanation says why the right answer is right and why the tempting wrong ones fail.

Lesson-level structure:
- Open with a short, motivating introduction: what the student will be able to DO by the end, and why it pays off on test day.
- For each important math strategy, include a multiple-choice math problem solvable with that exact strategy. If the brief suggests a question, write a similar one.
- Visual ideas (graphs, intercepts, intersections) must never live in prose alone: the EXPLORE step has the student produce the graph themselves in a desmos_activity block, and the CONFIRM step refers to what they saw there. Where a short video would genuinely add something beyond that (an animation, a walkthrough), add a video placeholder describing what it must show — sparingly.
- Geometry ideas (triangles, circles, angle relationships) get a figure block wherever the student needs to see the configuration — typically in the PREDICT or CONFIRM step. Give exact coordinates so the figure is drawn to scale.
- When the student only needs to SEE a finished graph rather than build one (e.g., the CONFIRM step showing the picture they should have found), use a graph_image block instead of a desmos_activity.
- End with retrieval, then practice: 1-2 closing check blocks that make the student recall the core principles from earlier in the lesson from memory (interleave concepts if there are several), then suggest 1-3 practice questions from the bank matching the skill.

Tone: clear, encouraging, plainly worded, for a high-school student. Short sentences, concrete numbers over abstraction.

Length: unless the brief says otherwise, a 10-20 minute lesson. Depth beats coverage: fewer ideas taken through the full predict-explore-confirm-check arc are better than more ideas merely explained.

General note: The Desmos calculator is built into the SAT. It graphs equations of x and y without simplifying first. To graph y = ______, the student doesn't need to type "y=" — Desmos assumes it for any expression of x. Assume the student knows this; don't re-explain it in the lesson.

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
- \`desmos_activity\` — an interactive Desmos calculator embedded in the lesson; the student works in it without leaving the page. This is the preferred vehicle for the exploration step of any graphable idea. Write \`desmos_instructions\` as exact, concrete steps (what to type, what to look at). Optionally preload \`desmos_initial_expressions\`. When there is one specific expression (or set) the student must produce, set \`desmos_expected\` to exactly what they should type plus 3-6 \`desmos_test_values\` (x-values that distinguish right from wrong answers numerically), and provide \`desmos_success_message\`, \`desmos_retry_message\`, and a \`desmos_solution\` walkthrough. Omit \`desmos_expected\` entirely for open exploration. Desmos expressions use plain calculator syntax — \`y=x^2-2x-15\`, \`f(x)=\\sqrt{x}\`, \`a=1\` — NOT \\( … \\) inline-math delimiters. At most one desmos_activity per major idea.
- \`figure\` — a static geometry diagram (triangle, circle, transversal, polygon), rendered server-side from your declarative \`figure\` spec into a styled image. Use it whenever the student must SEE a geometric configuration; do NOT use it for function graphs (use desmos_activity or graph_image for those). You supply exact coordinates (mathematical orientation, y increases upward) and the renderer draws to scale — compute coordinates that make the figure honest (a 37° angle must actually be 37°). Label text is PLAIN text ("35°", "x + 2", "r = 5") — no LaTeX delimiters, no HTML. Keep figures clean: at most ~8 labeled elements. Provide a short \`figure_caption\` when the figure needs context.
- \`graph_image\` — a STATIC picture of a graph, plotted from \`graph_expressions\` (plain Desmos syntax) and rendered to an image during preview. Use it when the student should simply SEE a finished graph — e.g. the CONFIRM step showing the annotated result they explored — not manipulate one (that is desmos_activity). Set \`graph_viewport\` ({xmin, xmax, ymin, ymax}) so the important features (intercepts, vertex, intersections) are framed, and add a short plain-text \`graph_caption\`.

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
              enum: [
                'text',
                'check',
                'video',
                'question_suggestion',
                'desmos_activity',
                'figure',
                'graph_image',
              ],
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
            // desmos_activity
            desmos_title: {
              type: 'string',
              description: 'desmos_activity: short title shown above the calculator.',
            },
            desmos_instructions: {
              type: 'string',
              description:
                'desmos_activity: HTML instructions — exact, concrete steps: what to type, what to look at.',
            },
            desmos_initial_expressions: {
              type: 'array',
              items: { type: 'string' },
              description:
                'desmos_activity: expressions preloaded into the calculator, plain Desmos syntax (e.g. "y=x^2-2x-15"). Often empty so the student types everything.',
            },
            desmos_expected: {
              type: 'array',
              items: { type: 'string' },
              description:
                'desmos_activity: the expression(s) the student must end up entering, written exactly as they should type them (e.g. "y=(x+1)(x-3)"). Omit entirely for open exploration.',
            },
            desmos_test_values: {
              type: 'array',
              items: { type: 'number' },
              description:
                'desmos_activity: 3-6 x-values used to numerically verify the student’s expression matches desmos_expected. Choose values that distinguish right from plausible-wrong answers.',
            },
            desmos_success_message: {
              type: 'string',
              description: 'desmos_activity: short HTML shown when the check passes.',
            },
            desmos_retry_message: {
              type: 'string',
              description:
                'desmos_activity: short HTML shown when the check fails — nudge, do not reveal.',
            },
            desmos_solution: {
              type: 'string',
              description:
                'desmos_activity: HTML walkthrough revealed after repeated misses. Only meaningful with desmos_expected.',
            },
            // figure
            figure: {
              type: 'object',
              description:
                'figure blocks: declarative geometry spec, rendered server-side to a styled to-scale image. Coordinates are mathematical (y up). Point refs are point names or {x, y} literals.',
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
              description: 'figure blocks: one short plain-text sentence shown under the figure.',
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
