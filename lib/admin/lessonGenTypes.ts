// Shared types for the AI lesson-generation pipeline. The runtime
// lives in lib/lesson/generated-spec.mjs (untyped shared .mjs, per
// the import-compiler module family); these interfaces describe its
// inputs/outputs for the TS route and client components.

/** The model's return_generated_lesson payload: a LessonTemplateSpec. */
export interface GeneratedLessonSpec {
  title?: string;
  description?: string;
  blocks?: unknown[];
}

export interface QuestionHint {
  domain_name: string;
  skill_name: string;
  difficulty: number | null;
}

/** Resolves a taxonomy hint to a published questions_v2 id, or null. */
export type ResolveQuestion = (hint: QuestionHint) => Promise<string | null>;

// A graph_image block the server cannot render (the Desmos API is
// browser-only). The pipeline emits a placeholder text block and one
// of these; the preview client renders + screenshots + uploads it,
// then swaps the final <img> html into the block matched by blockId.
export interface PendingGraph {
  blockId: string;
  expressions: string[];
  viewport: { xmin: number; xmax: number; ymin: number; ymax: number } | null;
  caption: string;
}

export interface MappedBlockRow {
  sort_order: number;
  block_type: 'text' | 'check' | 'video' | 'question_link' | 'desmos_interactive' | 'lesson_complete';
  content: unknown;
}

// The scope a generation was launched with (?skill= / ?pattern= on
// the generate page). Carried through the client so the save action
// can stamp the matching lesson_topics grain
// (docs/foundations-and-question-patterns.md §3.1).
export type LessonScope =
  | { grain: 'skill'; skillCode: string }
  | { grain: 'pattern'; patternId: string };
