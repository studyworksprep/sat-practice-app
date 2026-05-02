// View-model + payload shapes for the student notes feature.
//
// The DB row type lives in ./database (auto-generated). The shapes
// below are what the loaders return to pages and what the Server
// Actions accept / return — they normalize column names to camelCase
// and surface only the fields the UI actually reads.

import type { Json } from './database';

/** A TipTap document. Loosely typed because the editor schema can
 *  evolve (new node kinds for graphs / drawings) without forcing a
 *  type-system update; the renderer treats unknown nodes as no-ops. */
export type NoteDoc = Json;

/** What the loader returns for a single student note (camelCase). */
export interface StudentNote {
  id: string;
  userId: string;
  questionId: string | null;
  title: string | null;
  bodyJson: NoteDoc;
  bodyText: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lighter shape used by the index page — body_json omitted so the
 *  list payload stays small. */
export interface StudentNoteSummary {
  id: string;
  questionId: string | null;
  title: string | null;
  preview: string;
  tags: string[];
  updatedAt: string;
}

/** Input accepted by createNote / updateNote. */
export interface StudentNoteInput {
  title?: string | null;
  bodyJson: NoteDoc;
  bodyText: string;
  tags?: string[];
  questionId?: string | null;
}
