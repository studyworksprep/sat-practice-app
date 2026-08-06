// Reads an in-app practice-test attempt back as an answer vector.
//
// Two jobs, both for flow B (a student took the test in Studyworks and a
// tutor keyed the same answers into Bluebook to get official scores):
//
//   1. The transcription list the tutor reads while typing into
//      Bluebook — ordered by module and ordinal, one answer per line.
//   2. The vector a contributed report gets cross-checked against.
//      A per-question disagreement means the Bluebook keying slipped,
//      and it's far cheaper to catch that here than to discover a
//      mis-keyed row in the calibration data later.
//
// The join that matters: per-question results live in `attempts`, and
// the bridge is practice_test_item_attempts_v2.attempt_id = attempts.id.
// NOT attempts.context_id — that column exists, is also a uuid, and is
// populated for other flows, so joining through it looks plausible and
// silently returns the wrong rows.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModuleKey, ResponseVector, SectionCounts, BluebookSubject } from './parse-report.ts';
import { moduleKey } from './parse-report.ts';

export interface AttemptModuleSummary {
  key: ModuleKey;
  subjectCode: BluebookSubject;
  moduleNumber: 1 | 2;
  /** 'std' for module 1; 'easy' | 'hard' for the adaptive module 2. */
  routeCode: string | null;
  correctCount: number;
  itemCount: number;
  items: Array<{
    ordinal: number;
    isCorrect: boolean;
    /** What the student answered, as stored. Null when unanswered. */
    response: string | null;
  }>;
}

export interface AttemptVector {
  attemptId: string;
  practiceTestId: string;
  userId: string;
  testName: string;
  finishedAt: string | null;
  modules: AttemptModuleSummary[];
  responses: ResponseVector;
  counts: { rw: SectionCounts; math: SectionCounts };
  /** The module-2 form the runner actually served, per section. */
  routes: { rw: 'easy' | 'hard' | null; math: 'easy' | 'hard' | null };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;

/**
 * Load one attempt's stored answers.
 *
 * @returns null when the attempt doesn't exist or the caller can't see
 *   it — the caller cannot distinguish the two, which is intentional.
 */
export async function loadAttemptVector(
  supabase: AnyClient,
  attemptId: string,
): Promise<AttemptVector | null> {
  const { data: attempt } = await supabase
    .from('practice_test_attempts_v2')
    .select('id, user_id, practice_test_id, finished_at, practice_test:practice_tests_v2(name)')
    .eq('id', attemptId)
    .maybeSingle();

  if (!attempt) return null;

  const { data: moduleAttempts } = await supabase
    .from('practice_test_module_attempts_v2')
    .select(
      `id, correct_count,
       practice_test_module:practice_test_modules_v2(subject_code, module_number, route_code)`,
    )
    .eq('practice_test_attempt_id', attemptId);

  const modules: AttemptModuleSummary[] = [];

  for (const ma of (moduleAttempts ?? []) as any[]) {
    const mod = Array.isArray(ma.practice_test_module)
      ? ma.practice_test_module[0]
      : ma.practice_test_module;
    if (!mod) continue;

    const subjectCode: BluebookSubject = mod.subject_code === 'RW' ? 'RW' : 'MATH';
    const moduleNumber: 1 | 2 = mod.module_number === 2 ? 2 : 1;

    // attempts.is_correct / response_text reached through
    // practice_test_item_attempts_v2.attempt_id; the ordinal comes off
    // the module item the row points at.
    const { data: itemRows } = await supabase
      .from('practice_test_item_attempts_v2')
      .select(
        `attempt:attempts!practice_test_item_attempts_v2_attempt_id_fkey(is_correct, response_text),
         module_item:practice_test_module_items_v2(ordinal)`,
      )
      .eq('practice_test_module_attempt_id', ma.id);

    const items = ((itemRows ?? []) as any[])
      .map((row) => {
        const a = Array.isArray(row.attempt) ? row.attempt[0] : row.attempt;
        const item = Array.isArray(row.module_item) ? row.module_item[0] : row.module_item;
        if (!a || !item) return null;
        return {
          ordinal: item.ordinal as number,
          isCorrect: Boolean(a.is_correct),
          response: (a.response_text ?? null) as string | null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((x, y) => x.ordinal - y.ordinal);

    modules.push({
      key: moduleKey(subjectCode, moduleNumber),
      subjectCode,
      moduleNumber,
      routeCode: mod.route_code ?? null,
      // Prefer the counted rows over the denormalised correct_count:
      // the vector is what a contributed report gets compared against,
      // so it has to agree with itself.
      correctCount: items.filter((i) => i.isCorrect).length,
      itemCount: items.length,
      items,
    });
  }

  modules.sort(
    (a, b) =>
      a.subjectCode.localeCompare(b.subjectCode) || a.moduleNumber - b.moduleNumber,
  );

  const responses: ResponseVector = {};
  const counts = {
    rw: { m1: 0, m2: 0, total: 0 },
    math: { m1: 0, m2: 0, total: 0 },
  };

  for (const m of modules) {
    const bucket: Record<string, { correct: boolean; chosen?: string }> = {};
    for (const item of m.items) {
      bucket[String(item.ordinal)] = item.response
        ? { correct: item.isCorrect, chosen: item.response }
        : { correct: item.isCorrect };
    }
    responses[m.key] = bucket;

    const section = m.subjectCode === 'RW' ? counts.rw : counts.math;
    if (m.moduleNumber === 1) section.m1 = m.correctCount;
    else section.m2 = m.correctCount;
    section.total = section.m1 + section.m2;
  }

  const routeOf = (subject: BluebookSubject) => {
    const code = modules.find((m) => m.subjectCode === subject && m.moduleNumber === 2)?.routeCode;
    return code === 'hard' ? 'hard' : code === 'easy' ? 'easy' : null;
  };

  const test = Array.isArray((attempt as any).practice_test)
    ? (attempt as any).practice_test[0]
    : (attempt as any).practice_test;

  return {
    attemptId: attempt.id as string,
    practiceTestId: attempt.practice_test_id as string,
    userId: attempt.user_id as string,
    testName: (test?.name as string) ?? 'Practice Test',
    finishedAt: (attempt.finished_at as string) ?? null,
    modules,
    responses,
    counts,
    routes: { rw: routeOf('RW'), math: routeOf('MATH') },
  };
}

export interface VectorDiffEntry {
  module: ModuleKey;
  ordinal: number;
  /** What the in-app attempt recorded. Null when the module or question
   *  isn't present on that side at all. */
  attempt: boolean | null;
  /** What the uploaded Bluebook report says. */
  report: boolean | null;
}

export interface VectorDiff {
  /** True when every question present on both sides agrees. */
  matches: boolean;
  compared: number;
  disagreements: VectorDiffEntry[];
  /** Modules the report covers that the attempt doesn't, or vice versa.
   *  Common and usually benign — an RW-only attempt against a full
   *  report, say — so it's reported separately from a real conflict. */
  modulesOnlyInAttempt: ModuleKey[];
  modulesOnlyInReport: ModuleKey[];
}

/**
 * Compare an attempt's stored vector against a parsed report's.
 *
 * Only correctness is compared, never the chosen answer: Bluebook
 * reports frequently omit what the student picked, and a synthesized
 * placeholder would generate noise disagreements. A disagreement here
 * means one of the two is wrong about whether the question was right —
 * nearly always a slip while keying answers into Bluebook.
 */
export function diffResponseVectors(
  attemptVector: ResponseVector,
  reportVector: ResponseVector,
): VectorDiff {
  const allKeys = ['RW1', 'RW2', 'MATH1', 'MATH2'] as const;
  const disagreements: VectorDiffEntry[] = [];
  const modulesOnlyInAttempt: ModuleKey[] = [];
  const modulesOnlyInReport: ModuleKey[] = [];
  let compared = 0;

  for (const key of allKeys) {
    const inAttempt = attemptVector[key];
    const inReport = reportVector[key];

    if (inAttempt && !inReport) { modulesOnlyInAttempt.push(key); continue; }
    if (!inAttempt && inReport) { modulesOnlyInReport.push(key); continue; }
    if (!inAttempt || !inReport) continue;

    const ordinals = new Set([...Object.keys(inAttempt), ...Object.keys(inReport)]);
    for (const ordinal of [...ordinals].sort((a, b) => Number(a) - Number(b))) {
      const a = inAttempt[ordinal];
      const r = inReport[ordinal];
      if (a && r) {
        compared += 1;
        if (a.correct !== r.correct) {
          disagreements.push({
            module: key,
            ordinal: Number(ordinal),
            attempt: a.correct,
            report: r.correct,
          });
        }
      } else {
        disagreements.push({
          module: key,
          ordinal: Number(ordinal),
          attempt: a ? a.correct : null,
          report: r ? r.correct : null,
        });
      }
    }
  }

  return {
    matches: disagreements.length === 0,
    compared,
    disagreements,
    modulesOnlyInAttempt,
    modulesOnlyInReport,
  };
}
