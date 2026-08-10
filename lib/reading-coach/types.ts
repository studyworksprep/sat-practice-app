// Reading Coach shared types.
//
// The authoring contract is `ReadingCoachItemSpec` — the versioned
// JSON document an admin pastes into the import surface
// (docs/reading-coach-implementation-plan.md "Authoring contract").
// The spec is item-level: identity fields (slug/title/genre/…) plus
// the content and rubrics that become one immutable
// reading_coach_item_versions row and its four choice rows.
//
// Storage split (see the migration for the tables):
//   items    — stable identity + publication pointer
//   versions — question_stem_html / passage_html / task_type /
//              processing_mode columns, plus a `rubric` jsonb holding
//              StoredVersionRubric below (rubrics + an itemMeta
//              snapshot so publishing a version can sync the item row
//              without mutating any previously published version)
//   choices  — one row per lettered choice

import type { Row } from '../types/db.ts';

export const READING_COACH_GENRES = [
  'literature',
  'history',
  'social_science',
  'science',
] as const;
export type ReadingCoachGenre = (typeof READING_COACH_GENRES)[number];

export const READING_COACH_TASK_TYPES = [
  'main_idea',
  'detail',
  'function',
  'inference',
] as const;
export type ReadingCoachTaskType = (typeof READING_COACH_TASK_TYPES)[number];

export const READING_COACH_PROCESSING_MODES = [
  'whole_passage',
  'sentence_chunks',
  'adaptive',
] as const;
export type ReadingCoachProcessingMode =
  (typeof READING_COACH_PROCESSING_MODES)[number];

export const READING_COACH_RIGHTS_STATUSES = [
  'owned',
  'licensed',
  'public_domain',
  'permission_pending',
] as const;
export type ReadingCoachRightsStatus =
  (typeof READING_COACH_RIGHTS_STATUSES)[number];

export const READING_COACH_CHOICE_LABELS = ['A', 'B', 'C', 'D'] as const;
export type ReadingCoachChoiceLabel =
  (typeof READING_COACH_CHOICE_LABELS)[number];

export interface ReadingCoachSource {
  title?: string;
  author?: string;
  year?: number;
  url?: string;
  rightsStatus: ReadingCoachRightsStatus;
  rightsNotes?: string;
}

export interface ReadingCoachTaskRubric {
  canonicalTask: string;
  requiredIdeas: string[];
  acceptableVariants: string[];
  commonWrongTasks: string[];
}

export interface ReadingCoachProcessingUnit {
  key: string;
  textHtml: string;
  requiredIdeas: string[];
  requiredRelations: string[];
  acceptableOmissions: string[];
  prohibitedDistortions: string[];
}

export interface ReadingCoachPassageRubric {
  canonicalSummary: string;
  requiredIdeas: string[];
  requiredRelations: string[];
  acceptableOmissions: string[];
  prohibitedDistortions: string[];
}

export interface ReadingCoachPreanswerRubric {
  canonicalPreanswer: string;
  requiredIdeas: string[];
  acceptableVariants: string[];
  prohibitedClaims: string[];
}

export interface ReadingCoachChoiceSpec {
  label: ReadingCoachChoiceLabel;
  html: string;
  correct: boolean;
  rationaleHtml: string;
  errorCode?: string;
}

export interface ReadingCoachItemSpec {
  slug: string;
  title: string;
  genre: ReadingCoachGenre;
  difficulty: 1 | 2 | 3;
  taskType: ReadingCoachTaskType;
  source: ReadingCoachSource;
  questionStemHtml: string;
  passageHtml: string;
  processingMode: ReadingCoachProcessingMode;
  taskRubric: ReadingCoachTaskRubric;
  processingUnits: ReadingCoachProcessingUnit[];
  passageRubric: ReadingCoachPassageRubric;
  preanswerRubric: ReadingCoachPreanswerRubric;
  choices: ReadingCoachChoiceSpec[];
}

/** Item-identity snapshot stored inside each version's rubric jsonb.
 *  Publishing a version copies these onto the item row, so a draft
 *  revision can change the title without touching what students see
 *  until it actually publishes. */
export interface ReadingCoachItemMeta {
  title: string;
  genre: ReadingCoachGenre;
  difficulty: 1 | 2 | 3;
  source: ReadingCoachSource;
}

/** Shape of reading_coach_item_versions.rubric. */
export interface StoredVersionRubric {
  itemMeta: ReadingCoachItemMeta;
  taskRubric: ReadingCoachTaskRubric;
  processingUnits: ReadingCoachProcessingUnit[];
  passageRubric: ReadingCoachPassageRubric;
  preanswerRubric: ReadingCoachPreanswerRubric;
}

export type ReadingCoachItemRow = Row<'reading_coach_items'>;
export type ReadingCoachItemVersionRow = Row<'reading_coach_item_versions'>;
export type ReadingCoachChoiceRow = Row<'reading_coach_choices'>;

export interface ValidationIssue {
  path: string;
  message: string;
}
