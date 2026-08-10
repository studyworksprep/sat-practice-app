// ReadingCoachItemSpec parsing + validation.
//
// Runs in three places with identical results: the import client's
// live preview, the import Server Action (source of truth), and the
// publish action (re-validated from stored content, with the
// publish-only rights gate). sanitize-html is pure JS, so the same
// sanitizer runs on both sides of the wire — the client preview shows
// exactly the HTML the server would store.
//
// Validation policy (plan "Authoring contract"):
//   always      — structure, enums, nonempty rubric lists, unique
//                 unit keys, exactly four A–D choices with exactly
//                 one correct and a rationale each, HTML that still
//                 has text content after sanitization
//   publish     — additionally: source.rightsStatus must not be
//                 'permission_pending'
//
// The validator returns a *normalized* spec: every HTML field is
// replaced with its sanitized form and strings are trimmed, so
// callers persist what was validated, not what was pasted.

import { sanitizeQuestionHtml } from '../sanitize.ts';
import {
  READING_COACH_CHOICE_LABELS,
  READING_COACH_GENRES,
  READING_COACH_PROCESSING_MODES,
  READING_COACH_RIGHTS_STATUSES,
  READING_COACH_TASK_TYPES,
} from './types.ts';
import type {
  ReadingCoachChoiceSpec,
  ReadingCoachItemSpec,
  ReadingCoachProcessingUnit,
  ReadingCoachSource,
  ValidationIssue,
} from './types.ts';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseReadingCoachItemSpecText(
  text: string,
): { spec: unknown } | { error: string } {
  try {
    const spec: unknown = JSON.parse(text);
    if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
      return { error: 'Top level must be a JSON object.' };
    }
    return { spec };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export interface ValidateOptions {
  /** Apply the publish-only gates (nonpending rights). */
  forPublish?: boolean;
}

export type ValidateResult =
  | { ok: true; spec: ReadingCoachItemSpec }
  | { ok: false; errors: ValidationIssue[] };

export function validateReadingCoachItemSpec(
  input: unknown,
  opts: ValidateOptions = {},
): ValidateResult {
  const errors: ValidationIssue[] = [];
  const fail = (path: string, message: string) => {
    errors.push({ path, message });
  };

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: [{ path: '', message: 'Spec must be an object.' }] };
  }
  const raw = input as Record<string, unknown>;

  const str = (path: string, v: unknown): string => {
    if (typeof v !== 'string' || v.trim() === '') {
      fail(path, 'Required non-empty string.');
      return '';
    }
    return v.trim();
  };

  const stringList = (
    path: string,
    v: unknown,
    { requireNonEmpty }: { requireNonEmpty: boolean },
  ): string[] => {
    if (v === undefined && !requireNonEmpty) return [];
    if (!Array.isArray(v)) {
      fail(path, requireNonEmpty ? 'Required non-empty array of strings.' : 'Must be an array of strings.');
      return [];
    }
    const out: string[] = [];
    v.forEach((entry, i) => {
      if (typeof entry !== 'string' || entry.trim() === '') {
        fail(`${path}[${i}]`, 'Entries must be non-empty strings.');
      } else {
        out.push(entry.trim());
      }
    });
    if (requireNonEmpty && out.length === 0) {
      fail(path, 'At least one entry is required.');
    }
    return out;
  };

  const html = (path: string, v: unknown): string => {
    if (typeof v !== 'string' || v.trim() === '') {
      fail(path, 'Required non-empty HTML string.');
      return '';
    }
    const clean = sanitizeQuestionHtml(v).trim();
    if (htmlTextContent(clean) === '') {
      fail(path, 'No text content survives sanitization.');
      return '';
    }
    return clean;
  };

  const oneOf = <T extends string>(
    path: string,
    v: unknown,
    allowed: readonly T[],
  ): T => {
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
      fail(path, `Must be one of: ${allowed.join(', ')}.`);
      return allowed[0];
    }
    return v as T;
  };

  // ── identity ─────────────────────────────────────────────────
  const slug = str('slug', raw.slug);
  if (slug && !SLUG_RE.test(slug)) {
    fail('slug', 'Use kebab-case: lowercase letters, digits, single hyphens.');
  }
  const title = str('title', raw.title);
  const genre = oneOf('genre', raw.genre, READING_COACH_GENRES);
  const difficulty = raw.difficulty;
  if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3) {
    fail('difficulty', 'Must be 1, 2, or 3.');
  }
  const taskType = oneOf('taskType', raw.taskType, READING_COACH_TASK_TYPES);
  const processingMode = oneOf(
    'processingMode',
    raw.processingMode,
    READING_COACH_PROCESSING_MODES,
  );

  // ── source / rights ──────────────────────────────────────────
  let source: ReadingCoachSource = { rightsStatus: 'permission_pending' };
  if (typeof raw.source !== 'object' || raw.source === null) {
    fail('source', 'Required object with at least rightsStatus.');
  } else {
    const s = raw.source as Record<string, unknown>;
    const rightsStatus = oneOf(
      'source.rightsStatus',
      s.rightsStatus,
      READING_COACH_RIGHTS_STATUSES,
    );
    source = {
      rightsStatus,
      ...(typeof s.title === 'string' && s.title.trim() ? { title: s.title.trim() } : {}),
      ...(typeof s.author === 'string' && s.author.trim() ? { author: s.author.trim() } : {}),
      ...(typeof s.year === 'number' && Number.isInteger(s.year) ? { year: s.year } : {}),
      ...(typeof s.url === 'string' && s.url.trim() ? { url: s.url.trim() } : {}),
      ...(typeof s.rightsNotes === 'string' && s.rightsNotes.trim()
        ? { rightsNotes: s.rightsNotes.trim() }
        : {}),
    };
    if (opts.forPublish && rightsStatus === 'permission_pending') {
      fail('source.rightsStatus', 'Cannot publish while rights are permission_pending.');
    }
  }

  // ── content ──────────────────────────────────────────────────
  const questionStemHtml = html('questionStemHtml', raw.questionStemHtml);
  const passageHtml = html('passageHtml', raw.passageHtml);

  // ── task rubric ──────────────────────────────────────────────
  const tr = (raw.taskRubric ?? {}) as Record<string, unknown>;
  if (typeof raw.taskRubric !== 'object' || raw.taskRubric === null) {
    fail('taskRubric', 'Required object.');
  }
  const taskRubric = {
    canonicalTask: str('taskRubric.canonicalTask', tr.canonicalTask),
    requiredIdeas: stringList('taskRubric.requiredIdeas', tr.requiredIdeas, { requireNonEmpty: true }),
    acceptableVariants: stringList('taskRubric.acceptableVariants', tr.acceptableVariants, { requireNonEmpty: false }),
    commonWrongTasks: stringList('taskRubric.commonWrongTasks', tr.commonWrongTasks, { requireNonEmpty: false }),
  };

  // ── processing units ─────────────────────────────────────────
  const processingUnits: ReadingCoachProcessingUnit[] = [];
  if (!Array.isArray(raw.processingUnits) || raw.processingUnits.length === 0) {
    fail('processingUnits', 'At least one processing unit is required.');
  } else {
    const seenKeys = new Set<string>();
    raw.processingUnits.forEach((u, i) => {
      const path = `processingUnits[${i}]`;
      if (typeof u !== 'object' || u === null) {
        fail(path, 'Must be an object.');
        return;
      }
      const unit = u as Record<string, unknown>;
      const key = str(`${path}.key`, unit.key);
      if (key) {
        if (seenKeys.has(key)) fail(`${path}.key`, `Duplicate unit key "${key}".`);
        seenKeys.add(key);
      }
      processingUnits.push({
        key,
        textHtml: html(`${path}.textHtml`, unit.textHtml),
        requiredIdeas: stringList(`${path}.requiredIdeas`, unit.requiredIdeas, { requireNonEmpty: true }),
        requiredRelations: stringList(`${path}.requiredRelations`, unit.requiredRelations, { requireNonEmpty: false }),
        acceptableOmissions: stringList(`${path}.acceptableOmissions`, unit.acceptableOmissions, { requireNonEmpty: false }),
        prohibitedDistortions: stringList(`${path}.prohibitedDistortions`, unit.prohibitedDistortions, { requireNonEmpty: false }),
      });
    });
  }

  // ── passage rubric ───────────────────────────────────────────
  const pr = (raw.passageRubric ?? {}) as Record<string, unknown>;
  if (typeof raw.passageRubric !== 'object' || raw.passageRubric === null) {
    fail('passageRubric', 'Required object.');
  }
  const passageRubric = {
    canonicalSummary: str('passageRubric.canonicalSummary', pr.canonicalSummary),
    requiredIdeas: stringList('passageRubric.requiredIdeas', pr.requiredIdeas, { requireNonEmpty: true }),
    requiredRelations: stringList('passageRubric.requiredRelations', pr.requiredRelations, { requireNonEmpty: true }),
    acceptableOmissions: stringList('passageRubric.acceptableOmissions', pr.acceptableOmissions, { requireNonEmpty: false }),
    prohibitedDistortions: stringList('passageRubric.prohibitedDistortions', pr.prohibitedDistortions, { requireNonEmpty: false }),
  };

  // ── pre-answer rubric ────────────────────────────────────────
  const ar = (raw.preanswerRubric ?? {}) as Record<string, unknown>;
  if (typeof raw.preanswerRubric !== 'object' || raw.preanswerRubric === null) {
    fail('preanswerRubric', 'Required object.');
  }
  const preanswerRubric = {
    canonicalPreanswer: str('preanswerRubric.canonicalPreanswer', ar.canonicalPreanswer),
    requiredIdeas: stringList('preanswerRubric.requiredIdeas', ar.requiredIdeas, { requireNonEmpty: true }),
    acceptableVariants: stringList('preanswerRubric.acceptableVariants', ar.acceptableVariants, { requireNonEmpty: false }),
    prohibitedClaims: stringList('preanswerRubric.prohibitedClaims', ar.prohibitedClaims, { requireNonEmpty: false }),
  };

  // ── choices ──────────────────────────────────────────────────
  const choices: ReadingCoachChoiceSpec[] = [];
  if (!Array.isArray(raw.choices)) {
    fail('choices', 'Required array of exactly four choices.');
  } else {
    if (raw.choices.length !== 4) {
      fail('choices', `Exactly four choices required (got ${raw.choices.length}).`);
    }
    const seenLabels = new Set<string>();
    raw.choices.forEach((c, i) => {
      const path = `choices[${i}]`;
      if (typeof c !== 'object' || c === null) {
        fail(path, 'Must be an object.');
        return;
      }
      const choice = c as Record<string, unknown>;
      const label = oneOf(`${path}.label`, choice.label, READING_COACH_CHOICE_LABELS);
      if (seenLabels.has(label)) fail(`${path}.label`, `Duplicate label "${label}".`);
      seenLabels.add(label);
      if (typeof choice.correct !== 'boolean') {
        fail(`${path}.correct`, 'Required boolean.');
      }
      choices.push({
        label,
        html: html(`${path}.html`, choice.html),
        correct: choice.correct === true,
        rationaleHtml: html(`${path}.rationaleHtml`, choice.rationaleHtml),
        ...(typeof choice.errorCode === 'string' && choice.errorCode.trim()
          ? { errorCode: choice.errorCode.trim() }
          : {}),
      });
    });
    const correctCount = choices.filter((c) => c.correct).length;
    if (raw.choices.length === 4 && correctCount !== 1) {
      fail('choices', `Exactly one correct choice required (got ${correctCount}).`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    spec: {
      slug,
      title,
      genre,
      difficulty: difficulty as 1 | 2 | 3,
      taskType,
      source,
      questionStemHtml,
      passageHtml,
      processingMode,
      taskRubric,
      processingUnits,
      passageRubric,
      preanswerRubric,
      choices,
    },
  };
}

/** Text content of an HTML fragment — enough to detect "sanitized to
 *  nothing" without a DOM. */
export function htmlTextContent(htmlFragment: string): string {
  return htmlFragment
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
