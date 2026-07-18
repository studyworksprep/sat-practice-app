import { apiRoute, ok, fail } from '@/lib/api/response';
import { requireRole } from '@/lib/api/auth';
import { fetchClaudeMessages, extractToolUse } from '@/lib/admin/claude';
import { uploadSvgFigure } from '@/lib/content/upload-figure-server';
import {
  LESSON_GEN_MODEL,
  LESSON_INFO_PLACEHOLDER,
  SYSTEM_PROMPT,
  RETURN_GENERATED_LESSON_TOOL,
  buildRevisionUserMessage,
} from '@/lib/admin/lessonGenPrompt';
import {
  generatedLessonToBlocks,
  type GeneratedLesson,
  type QuestionHint,
} from '@/lib/admin/lessonGenMapper';
// The validator is shared .mjs (also runs client-side in the import
// preview); it has no type declarations.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { validateLessonBlocks } from '@/lib/lesson/lesson-validation.mjs';

// ============================================================
// POST /api/admin/lessons/generate
// ============================================================
// Admin-only. Two modes, both returning the draft WITHOUT writing to
// the DB — the client shows a read-only preview and only persists via
// the saveGeneratedLesson Server Action once the admin confirms:
//
//   Initial:  { lessonInfo, template } — substitutes the lesson brief
//             into the prompt template and asks Claude for a full
//             lesson via the return_generated_lesson tool.
//   Revision: { lessonInfo, currentLesson, feedback } — replays the
//             previous return_generated_lesson payload with the
//             admin's preview feedback and asks for the complete
//             revised lesson.
//
// Either way the payload is mapped + validated and the response is
// ok({ generated, title, description, blocks, warnings }) —
// `generated` is the raw tool payload the client must echo back for
// the next revision turn; `blocks` are the mapped lesson_blocks rows
// the preview renders and the save action persists.
//
// This is an API route (not a Server Action) so it can carry its own
// maxDuration: an opus-class model writing a 10-20 minute lesson with
// adaptive thinking can run well past the platform default.
export const maxDuration = 300;

interface GenerateBody {
  lessonInfo?: unknown;
  template?: unknown;
  currentLesson?: unknown;
  feedback?: unknown;
}

export const POST = apiRoute(async (request: Request) => {
  const ctx = await requireRole(['admin']);

  let body: GenerateBody;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const lessonInfo = typeof body.lessonInfo === 'string' ? body.lessonInfo.trim() : '';
  const template = typeof body.template === 'string' ? body.template : '';
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
  const isRevision = feedback !== '';

  if (!lessonInfo) {
    return fail('Describe the lesson you want in the lesson brief.', 400);
  }

  let userMessage: string;
  if (isRevision) {
    if (typeof body.currentLesson !== 'object' || body.currentLesson === null) {
      return fail('A revision needs the current lesson draft.', 400);
    }
    userMessage = buildRevisionUserMessage(lessonInfo, body.currentLesson, feedback);
  } else {
    if (!template.includes(LESSON_INFO_PLACEHOLDER)) {
      return fail(
        `The prompt template must contain ${LESSON_INFO_PLACEHOLDER} so the lesson brief can be inserted.`,
        400,
      );
    }
    userMessage = template.replaceAll(LESSON_INFO_PLACEHOLDER, lessonInfo);
  }

  // Adaptive thinking materially improves lesson coherence (the model
  // plans the arc and works the examples before writing). Forced
  // tool_choice is incompatible with thinking, so we use auto + a firm
  // "call the tool exactly once" instruction and validate the
  // tool_use came back — same approach as questions-v2/generate.
  let response;
  try {
    response = await fetchClaudeMessages({
      model: LESSON_GEN_MODEL,
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [RETURN_GENERATED_LESSON_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (e) {
    console.error('lessons/generate Claude error:', e);
    return fail(e instanceof Error ? e.message : 'Claude request failed', 500);
  }

  const generated = extractToolUse(
    response,
    RETURN_GENERATED_LESSON_TOOL.name,
  ) as GeneratedLesson | null;
  if (
    !generated ||
    typeof generated.title !== 'string' ||
    !generated.title.trim() ||
    !Array.isArray(generated.blocks) ||
    generated.blocks.length === 0
  ) {
    return fail('Claude did not return a usable lesson. Try regenerating.', 502);
  }

  // Resolve question_suggestion hints against the published bank with
  // the admin's own RLS-scoped client. Prefer an exact difficulty
  // match, fall back to any difficulty for the skill.
  const resolveQuestion = async (hint: QuestionHint): Promise<string | null> => {
    const run = async (withDifficulty: boolean) => {
      let query = ctx.supabase
        .from('questions_v2')
        .select('id')
        .eq('is_published', true)
        .eq('is_broken', false)
        .eq('domain_name', hint.domain_name)
        .eq('skill_name', hint.skill_name);
      if (withDifficulty && hint.difficulty != null) {
        query = query.eq('difficulty', hint.difficulty);
      }
      const { data, error } = await query.limit(5);
      if (error || !data || data.length === 0) return null;
      return data[Math.floor(Math.random() * data.length)].id;
    };
    return (await run(true)) ?? (hint.difficulty != null ? run(false) : null);
  };

  // Figures render server-side (deterministic SVG) and land in the
  // shared question-figures bucket, content-addressed — same store
  // the editor's manual image upload uses.
  const mapped = await generatedLessonToBlocks(generated, resolveQuestion, (svg) =>
    uploadSvgFigure(ctx.supabase, svg),
  );
  if (mapped.blocks.length === 0) {
    return fail('Every generated block was invalid. Try regenerating.', 502);
  }

  const validation = validateLessonBlocks(mapped.blocks);
  if (!validation.ok) {
    return fail('The generated lesson failed validation. Try regenerating.', 422, {
      validationErrors: validation.errors,
    });
  }

  const description =
    typeof generated.description === 'string' && generated.description.trim()
      ? generated.description.trim()
      : null;

  // Nothing is written to the DB here — the client previews this
  // draft (repeating through revision turns as needed) and persists
  // it via saveGeneratedLesson only when the admin confirms.
  return ok({
    generated,
    title: generated.title.trim(),
    description,
    blocks: mapped.blocks,
    // graph_image blocks the client must render via the browser-only
    // Desmos API and swap into `blocks` before saving.
    pendingGraphs: mapped.pendingGraphs,
    warnings: [...mapped.warnings, ...(validation.warnings ?? [])],
  });
});
