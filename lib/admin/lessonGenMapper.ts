// Maps the return_generated_lesson tool payload (see
// lib/admin/lessonGenPrompt.ts) into lesson_blocks-shaped rows the
// editor and student runtime understand — the same content shapes
// createStarterBlock() in lib/lesson/editor-utils.mjs produces.
//
// Trust boundary: the payload is model output. Every HTML string is
// run through sanitizeQuestionHtml (the admin-content profile), and
// malformed blocks are dropped with a recorded warning instead of
// failing the whole generation. The caller runs validateLessonBlocks
// on the result before anything is written to the DB.

import { sanitizeQuestionHtml } from '@/lib/sanitize';
import type { Json } from '@/lib/types';
// Shared .mjs desmos contract (also used by the editor + validator);
// no type declarations.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { parseDesmosInteractiveContent } from '@/lib/lesson/desmos-interactive.mjs';
// Shared .mjs figure renderer (unit-tested via node --test); no type
// declarations.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { renderFigureSvg } from '@/lib/figures/figure-renderer.mjs';

export interface GeneratedLessonBlock {
  type?: string;
  // text
  html?: string;
  // check
  prompt?: string;
  choices?: unknown[];
  correct_index?: number;
  explanation?: string;
  // video
  video_topic?: string;
  // question_suggestion
  domain_name?: string;
  skill_name?: string;
  difficulty?: number | null;
  note?: string;
  // desmos_activity
  desmos_title?: string;
  desmos_instructions?: string;
  desmos_initial_expressions?: unknown[];
  desmos_expected?: unknown[];
  desmos_test_values?: unknown[];
  desmos_success_message?: string;
  desmos_retry_message?: string;
  desmos_solution?: string;
  // figure
  figure?: unknown;
  figure_caption?: string;
}

export interface GeneratedLesson {
  title?: string;
  description?: string;
  blocks?: GeneratedLessonBlock[];
}

export interface QuestionHint {
  domain_name: string;
  skill_name: string;
  difficulty: number | null;
}

/** Resolves a taxonomy hint to a published questions_v2 id, or null. */
export type ResolveQuestion = (hint: QuestionHint) => Promise<string | null>;

/** Uploads a rendered figure SVG and returns its public URL. */
export type UploadFigureSvg = (svg: string) => Promise<string>;

export interface MappedBlockRow {
  sort_order: number;
  block_type: 'text' | 'check' | 'video' | 'question_link' | 'desmos_interactive' | 'lesson_complete';
  content: Json;
}

export interface MappedLesson {
  blocks: MappedBlockRow[];
  warnings: string[];
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function generatedLessonToBlocks(
  generated: GeneratedLesson,
  resolveQuestion: ResolveQuestion,
  uploadFigureSvg?: UploadFigureSvg,
): Promise<MappedLesson> {
  const warnings: string[] = [];
  const out: Array<Omit<MappedBlockRow, 'sort_order'>> = [];
  const source = Array.isArray(generated?.blocks) ? generated.blocks : [];

  for (let i = 0; i < source.length; i++) {
    const raw = source[i] ?? {};
    const id = `gen_${raw.type ?? 'block'}_${i}`;
    const label = `Block ${i + 1} (${raw.type ?? 'unknown'})`;

    if (raw.type === 'text') {
      const html = sanitizeQuestionHtml(typeof raw.html === 'string' ? raw.html : '');
      if (!html.trim()) {
        warnings.push(`${label}: empty text content after sanitization — dropped.`);
        continue;
      }
      out.push({ block_type: 'text', content: { id, html } });
      continue;
    }

    if (raw.type === 'check') {
      const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
      const choices = (Array.isArray(raw.choices) ? raw.choices : [])
        .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
        .map((c) => c.trim());
      if (!prompt || choices.length < 2) {
        warnings.push(`${label}: needs a prompt and at least 2 choices — dropped.`);
        continue;
      }
      const correctIndex =
        Number.isInteger(raw.correct_index) &&
        (raw.correct_index as number) >= 0 &&
        (raw.correct_index as number) < choices.length
          ? (raw.correct_index as number)
          : 0;
      if (correctIndex !== raw.correct_index) {
        warnings.push(`${label}: correct_index was out of range — reset to the first choice; review it.`);
      }
      out.push({
        block_type: 'check',
        content: {
          id,
          prompt,
          choices,
          correct_index: correctIndex,
          explanation: typeof raw.explanation === 'string' ? raw.explanation : '',
        },
      });
      continue;
    }

    if (raw.type === 'video') {
      const topic = typeof raw.video_topic === 'string' ? raw.video_topic.trim() : '';
      out.push({
        block_type: 'video',
        content: {
          id,
          url: '',
          caption: topic ? `Video placeholder: ${topic}` : 'Video placeholder',
        },
      });
      continue;
    }

    if (raw.type === 'desmos_activity') {
      const instructions = sanitizeQuestionHtml(
        typeof raw.desmos_instructions === 'string' ? raw.desmos_instructions : '',
      );
      if (!instructions.trim()) {
        warnings.push(`${label}: empty Desmos instructions — dropped.`);
        continue;
      }
      const strings = (v: unknown): string[] =>
        (Array.isArray(v) ? v : [])
          .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
          .map((s) => s.trim());
      const expected = strings(raw.desmos_expected);
      const testValues = (Array.isArray(raw.desmos_test_values) ? raw.desmos_test_values : [])
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      const success = sanitizeQuestionHtml(
        typeof raw.desmos_success_message === 'string' && raw.desmos_success_message.trim()
          ? raw.desmos_success_message
          : '<p>Nice — that&rsquo;s exactly it.</p>',
      );
      const retry = sanitizeQuestionHtml(
        typeof raw.desmos_retry_message === 'string' && raw.desmos_retry_message.trim()
          ? raw.desmos_retry_message
          : '<p>Not quite yet — reread the instructions and check signs, parentheses, and exponents.</p>',
      );
      const solution =
        typeof raw.desmos_solution === 'string' && raw.desmos_solution.trim()
          ? sanitizeQuestionHtml(raw.desmos_solution)
          : '';

      // Two shapes: a checked activity (expected expression + numeric
      // equivalence test) or open exploration (state mode, nothing
      // gated). require_success stays false in both — an AI-authored
      // equivalence check that is subtly wrong must never hard-block
      // a student; admins can flip the gate on in the editor.
      const content = {
        id,
        title:
          typeof raw.desmos_title === 'string' && raw.desmos_title.trim()
            ? raw.desmos_title.trim()
            : 'Try it in Desmos',
        instructions_html: instructions,
        caption_html: '',
        initial_expressions: strings(raw.desmos_initial_expressions).map((latex) => ({ latex })),
        calculator_options: { expressions: true, lockViewport: false, sliders: true },
        goal:
          expected.length > 1
            ? { type: 'multi_expression', required_count: expected.length }
            : { type: 'enter_expression' },
        validation:
          expected.length > 0
            ? {
                mode: 'equivalent',
                expected,
                test_values: testValues.length > 0 ? testValues : [-2, -1, 0, 1, 2, 3],
              }
            : { mode: 'state', state_rules: { min_expressions: 0 } },
        feedback: {
          success_message_html: success,
          retry_message_html: retry,
          ...(expected.length > 0 && solution
            ? { reveal_solution_after_attempts: 3, solution_html: solution }
            : {}),
        },
        progression: { require_success: false },
      };

      try {
        parseDesmosInteractiveContent(content);
      } catch (e) {
        // Keep the pedagogical intent as plain instructions instead of
        // failing the lesson on a malformed activity.
        out.push({
          block_type: 'text',
          content: { id, html: `<p><strong>Try it in Desmos:</strong></p>${instructions}` },
        });
        warnings.push(
          `${label}: invalid Desmos activity (${e instanceof Error ? e.message : 'unknown'}) — kept the instructions as a text block.`,
        );
        continue;
      }

      out.push({ block_type: 'desmos_interactive', content: content as unknown as Json });
      continue;
    }

    if (raw.type === 'figure') {
      const caption =
        typeof raw.figure_caption === 'string' && raw.figure_caption.trim()
          ? raw.figure_caption.trim()
          : '';
      // Render → upload → embed as a plain <img> text block. Plain
      // p/img/em markup (no <figure> wrapper) so the block round-trips
      // through the TipTap editor unharmed.
      try {
        if (!uploadFigureSvg) throw new Error('no figure upload configured');
        const rendered = renderFigureSvg(raw.figure) as {
          svg: string;
          width: number;
          warnings: string[];
        };
        for (const w of rendered.warnings) warnings.push(`${label}: ${w}`);
        const url = await uploadFigureSvg(rendered.svg);
        const html = sanitizeQuestionHtml(
          `<p><img src="${escapeHtml(url)}" alt="${escapeHtml(caption || 'Geometry figure')}" width="${rendered.width}" /></p>` +
            (caption ? `<p><em>${escapeHtml(caption)}</em></p>` : ''),
        );
        out.push({ block_type: 'text', content: { id, html } });
      } catch (e) {
        // Keep the lesson flowing: fall back to the caption (or a
        // placeholder note) so the admin sees where the figure was
        // meant to go.
        const note = caption || 'A figure was planned here but could not be rendered.';
        out.push({
          block_type: 'text',
          content: { id, html: `<p><em>[Figure: ${escapeHtml(note)}]</em></p>` },
        });
        warnings.push(
          `${label}: figure could not be rendered/uploaded (${e instanceof Error ? e.message : 'unknown'}) — inserted a placeholder note.`,
        );
      }
      continue;
    }

    if (raw.type === 'question_suggestion') {
      const domainName = typeof raw.domain_name === 'string' ? raw.domain_name.trim() : '';
      const skillName = typeof raw.skill_name === 'string' ? raw.skill_name.trim() : '';
      const note = typeof raw.note === 'string' ? raw.note.trim() : '';
      const difficulty =
        Number.isInteger(raw.difficulty) && (raw.difficulty as number) >= 1 && (raw.difficulty as number) <= 3
          ? (raw.difficulty as number)
          : null;

      let questionId: string | null = null;
      if (domainName && skillName) {
        questionId = await resolveQuestion({
          domain_name: domainName,
          skill_name: skillName,
          difficulty,
        });
      }

      if (questionId) {
        out.push({ block_type: 'question_link', content: { id, question_id: questionId } });
      } else {
        // Taxonomy miss (or empty bank slice): keep the pedagogical
        // intent as a text note instead of failing the generation.
        const parts = [skillName || domainName || 'a related skill', note].filter(Boolean);
        out.push({
          block_type: 'text',
          content: {
            id,
            html: `<p><em>Suggested practice:</em> ${escapeHtml(parts.join(' — '))}</p>`,
          },
        });
        warnings.push(
          `${label}: no published bank question matched "${domainName} / ${skillName}" — inserted a text note instead.`,
        );
      }
      continue;
    }

    warnings.push(`${label}: unknown block type — dropped.`);
  }

  if (out.length > 0) {
    out.push({
      block_type: 'lesson_complete',
      content: {
        id: 'gen_lesson_complete',
        html: '<p>You&rsquo;ve completed the lesson. Great work!</p>',
        button_label: 'Complete Lesson',
      },
    });
  }

  return {
    blocks: out.map((b, i) => ({ ...b, sort_order: i })),
    warnings,
  };
}
