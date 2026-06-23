// Block-type registry for the WYSIWYG lesson editor.
//
// One place that maps each lesson_blocks.block_type to the
// author-facing vocabulary (label, blurb, icon). The five entries
// here are exactly the five block types an admin can create from the
// canvas — they line up 1:1 with the DB CHECK constraint on
// lesson_blocks.block_type and with the runtime renderers in
// lib/ui/LessonSlideshow.jsx.
//
// The order of CREATABLE_BLOCK_TYPES is the order the "add block"
// menu lists them.

export type LessonBlockType =
  | 'text'
  | 'video'
  | 'check'
  | 'question_link'
  | 'desmos_interactive';

export type BlockMeta = {
  type: LessonBlockType;
  /** Author-facing name, not the raw DB enum. */
  label: string;
  /** One-line description shown in the add-block menu. */
  blurb: string;
  /** Emoji glyph — cheap, dependency-free icon for the card + menu. */
  icon: string;
};

export const BLOCK_META: Record<LessonBlockType, BlockMeta> = {
  text: {
    type: 'text',
    label: 'Text & image',
    blurb: 'Rich text, headings, lists, and images.',
    icon: '📝',
  },
  video: {
    type: 'video',
    label: 'Video',
    blurb: 'Embed a YouTube or Vimeo video.',
    icon: '🎬',
  },
  check: {
    type: 'check',
    label: 'Interactive question',
    blurb: 'A multiple-choice check answered inside the lesson.',
    icon: '✅',
  },
  question_link: {
    type: 'question_link',
    label: 'Practice question',
    blurb: 'Pull a real question from the question bank.',
    icon: '📚',
  },
  desmos_interactive: {
    type: 'desmos_interactive',
    label: 'Desmos interactive',
    blurb: 'A Desmos graph that checks the learner reaches a target state.',
    icon: '📈',
  },
};

export const CREATABLE_BLOCK_TYPES: LessonBlockType[] = [
  'text',
  'video',
  'check',
  'question_link',
  'desmos_interactive',
];

export function blockMetaFor(type: string | undefined): BlockMeta {
  if (type && type in BLOCK_META) return BLOCK_META[type as LessonBlockType];
  return {
    type: (type as LessonBlockType) ?? 'text',
    label: type ?? 'Unknown block',
    blurb: '',
    icon: '⬚',
  };
}
