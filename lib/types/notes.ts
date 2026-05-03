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

/** Subject / domain / skill metadata copied from a linked question
 *  on first save (sticky — the student can later override these via
 *  the editor and the server respects their values on subsequent
 *  writes). All four fields are nullable: standalone notes start
 *  out uncategorized until the student fills them in. */
export interface NoteTaxonomy {
  /** 'rw' | 'math' — the SAT section, derived via domainSection() */
  subjectCode: string | null;
  domainCode: string | null;
  domainName: string | null;
  skillCode: string | null;
  skillName: string | null;
}

/** What the loader returns for a single student note (camelCase). */
export interface StudentNote extends NoteTaxonomy {
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
export interface StudentNoteSummary extends NoteTaxonomy {
  id: string;
  questionId: string | null;
  title: string | null;
  preview: string;
  /** HTML rendering of the doc snippet with `\(…\)` delimiters
   *  around math nodes for MathJax to typeset on the client. */
  previewHtml: string;
  tags: string[];
  updatedAt: string;
}

/** Input accepted by createNote / updateNote. Taxonomy fields are
 *  optional: when missing on a note that's linked to a question, the
 *  Server Action copies them from the question on first save. */
export interface StudentNoteInput extends Partial<NoteTaxonomy> {
  title?: string | null;
  bodyJson: NoteDoc;
  bodyText: string;
  tags?: string[];
  questionId?: string | null;
}
