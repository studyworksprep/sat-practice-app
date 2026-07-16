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

export interface MappedBlockRow {
  sort_order: number;
  block_type: 'text' | 'check' | 'video' | 'question_link' | 'lesson_complete';
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
