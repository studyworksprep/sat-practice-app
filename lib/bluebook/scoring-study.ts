import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedBluebookReport, ResponseVector } from './parse-report.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;

type SubjectCode = 'RW' | 'MATH';
type RouteCode = 'std' | 'easy' | 'hard';

interface TestItem {
  moduleId: string;
  subjectCode: SubjectCode;
  moduleNumber: 1 | 2;
  routeCode: RouteCode;
  ordinal: number;
  questionId: string;
  correctAnswer: unknown;
  questionType: string;
  difficulty: number | null;
  scoreBand: number | null;
  domainCode: string | null;
  domainName: string | null;
  skillCode: string | null;
  skillName: string | null;
}

export interface ResponseSnapshotItem {
  section: 'reading_writing' | 'math';
  module_number: 1 | 2;
  route_code: RouteCode;
  ordinal: number;
  question_id: string;
  is_correct: boolean;
  chosen?: string;
  difficulty: number | null;
  score_band: number | null;
  question_type: string;
  domain_code: string | null;
  domain_name: string | null;
  skill_code: string | null;
  skill_name: string | null;
}

export interface RecognizedStudyForm {
  routes: { rw: 'easy' | 'hard' | null; math: 'easy' | 'hard' | null };
  formFingerprint: string;
  responseSnapshot: ResponseSnapshotItem[];
}

function normalizeToken(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^[a-d]$/i.test(trimmed)) return trimmed.toUpperCase();
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return String(numeric);
  return trimmed.replace(/\s+/g, '').toLowerCase();
}

function addTokens(out: Set<string>, value: unknown) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const entry of value) addTokens(out, entry);
    return;
  }
  if (typeof value === 'object') {
    const answer = value as Record<string, unknown>;
    addTokens(out, answer.option_label);
    addTokens(out, answer.option_labels);
    addTokens(out, answer.number);
    addTokens(out, answer.text);
    return;
  }

  const raw = String(value).trim();
  if (!raw) return;
  if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('"') && raw.endsWith('"'))) {
    try {
      addTokens(out, JSON.parse(raw));
      return;
    } catch {
      // Fall through to the human-readable alternatives below.
    }
  }
  for (const part of raw.split(',')) {
    const token = normalizeToken(part);
    if (token) out.add(token);
  }
}

export function answerTokens(value: unknown): string[] {
  const tokens = new Set<string>();
  addTokens(tokens, value);
  return [...tokens].sort();
}

export function answersMatch(reportAnswer: unknown, storedAnswer: unknown): boolean {
  const report = new Set(answerTokens(reportAnswer));
  return answerTokens(storedAnswer).some((token) => report.has(token));
}

/** Stable fingerprint of what the uploaded report itself says the form is. */
export function fingerprintParsedForm(parsed: ParsedBluebookReport): string {
  const signature = parsed.questions
    .map((q) => ({
      subject: q.subjectCode,
      module: q.moduleNumber,
      ordinal: q.ordinal,
      type: q.questionType,
      answers: answerTokens(q.correctAnswer),
      domain: q.domain.trim().toLowerCase(),
    }))
    .sort(
      (a, b) =>
        a.subject.localeCompare(b.subject) || a.module - b.module || a.ordinal - b.ordinal,
    );
  return createHash('sha256').update(JSON.stringify(signature)).digest('hex');
}

function moduleMatchesReport(
  items: TestItem[],
  parsed: ParsedBluebookReport,
  subjectCode: SubjectCode,
  moduleNumber: 1 | 2,
): boolean {
  const reportItems = parsed.questions
    .filter((q) => q.subjectCode === subjectCode && q.moduleNumber === moduleNumber)
    .sort((a, b) => a.ordinal - b.ordinal);
  const storedItems = items.slice().sort((a, b) => a.ordinal - b.ordinal);
  if (!reportItems.length || reportItems.length !== storedItems.length) return false;

  return reportItems.every((reportItem, index) => {
    const storedItem = storedItems[index];
    return (
      storedItem.ordinal === reportItem.ordinal &&
      answersMatch(reportItem.correctAnswer, storedItem.correctAnswer)
    );
  });
}

function identifyRoute(
  items: TestItem[],
  parsed: ParsedBluebookReport,
  subjectCode: SubjectCode,
): 'easy' | 'hard' | null {
  const reportHasSection = parsed.questions.some((q) => q.subjectCode === subjectCode);
  if (!reportHasSection) return null;

  const matches = (['easy', 'hard'] as const).filter((route) =>
    moduleMatchesReport(
      items.filter(
        (item) =>
          item.subjectCode === subjectCode &&
          item.moduleNumber === 2 &&
          item.routeCode === route,
      ),
      parsed,
      subjectCode,
      2,
    ),
  );

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `The ${subjectCode === 'RW' ? 'Reading and Writing' : 'Math'} Module 2 answer key does not match either stored form. The report may be from a revised or different test.`
        : `The ${subjectCode === 'RW' ? 'Reading and Writing' : 'Math'} Module 2 form is ambiguous.`,
    );
  }
  return matches[0];
}

async function loadTestItems(supabase: AnyClient, practiceTestId: string): Promise<TestItem[]> {
  const { data: modules, error: modulesError } = await supabase
    .from('practice_test_modules_v2')
    .select('id, subject_code, module_number, route_code')
    .eq('practice_test_id', practiceTestId);
  if (modulesError) throw new Error(`Could not load the practice-test forms: ${modulesError.message}`);

  const moduleById = new Map((modules ?? []).map((m: any) => [m.id as string, m]));
  const moduleIds = [...moduleById.keys()];
  if (!moduleIds.length) throw new Error('This practice test has no stored modules.');

  const { data: rows, error: itemsError } = await supabase
    .from('practice_test_module_items_v2')
    .select(
      `practice_test_module_id, ordinal,
       question:questions_v2!practice_test_module_items_v2_question_id_fkey(
         id, correct_answer, question_type, difficulty, score_band,
         domain_code, domain_name, skill_code, skill_name
       )`,
    )
    .in('practice_test_module_id', moduleIds);
  if (itemsError) throw new Error(`Could not load the practice-test questions: ${itemsError.message}`);

  return (rows ?? []).map((row: any) => {
    const storedModule = moduleById.get(row.practice_test_module_id as string);
    const question = Array.isArray(row.question) ? row.question[0] : row.question;
    if (!storedModule || !question) throw new Error('A practice-test item is missing its module or question.');
    return {
      moduleId: storedModule.id,
      subjectCode: storedModule.subject_code === 'RW' ? 'RW' : 'MATH',
      moduleNumber: storedModule.module_number === 2 ? 2 : 1,
      routeCode: storedModule.route_code as RouteCode,
      ordinal: row.ordinal as number,
      questionId: question.id as string,
      correctAnswer: question.correct_answer,
      questionType: question.question_type as string,
      difficulty: question.difficulty as number | null,
      scoreBand: question.score_band as number | null,
      domainCode: question.domain_code as string | null,
      domainName: question.domain_name as string | null,
      skillCode: question.skill_code as string | null,
      skillName: question.skill_name as string | null,
    };
  });
}

/**
 * Recognize the actual Module 2 forms and freeze every analysis feature
 * while the report, module placements, and question metadata still agree.
 */
export async function recognizeStudyForm(
  supabase: AnyClient,
  practiceTestId: string,
  parsed: ParsedBluebookReport,
  responses: ResponseVector,
): Promise<RecognizedStudyForm> {
  const items = await loadTestItems(supabase, practiceTestId);
  for (const subjectCode of ['RW', 'MATH'] as const) {
    const reportHasSection = parsed.questions.some((q) => q.subjectCode === subjectCode);
    if (
      reportHasSection &&
      !moduleMatchesReport(
        items.filter(
          (item) =>
            item.subjectCode === subjectCode &&
            item.moduleNumber === 1 &&
            item.routeCode === 'std',
        ),
        parsed,
        subjectCode,
        1,
      )
    ) {
      throw new Error(
        `The ${subjectCode === 'RW' ? 'Reading and Writing' : 'Math'} Module 1 answer key does not match the stored test. The report may be from a revised or different form.`,
      );
    }
  }
  const routes = {
    rw: identifyRoute(items, parsed, 'RW'),
    math: identifyRoute(items, parsed, 'MATH'),
  };

  const selectedItems = items.filter((item) => {
    if (item.moduleNumber === 1) return item.routeCode === 'std';
    return item.routeCode === (item.subjectCode === 'RW' ? routes.rw : routes.math);
  });

  const byPlacement = new Map(
    selectedItems.map((item) => [`${item.subjectCode}${item.moduleNumber}:${item.ordinal}`, item]),
  );
  const responseSnapshot: ResponseSnapshotItem[] = [];

  for (const q of parsed.questions) {
    const item = byPlacement.get(`${q.subjectCode}${q.moduleNumber}:${q.ordinal}`);
    if (!item) {
      throw new Error(
        `Question ${q.ordinal} in ${q.subjectCode} Module ${q.moduleNumber} does not map to the recognized stored form.`,
      );
    }
    const response = responses[`${q.subjectCode}${q.moduleNumber}`]?.[String(q.ordinal)];
    if (!response) throw new Error('The parsed response vector is incomplete.');
    responseSnapshot.push({
      section: q.subjectCode === 'RW' ? 'reading_writing' : 'math',
      module_number: q.moduleNumber,
      route_code: item.routeCode,
      ordinal: q.ordinal,
      question_id: item.questionId,
      is_correct: response.correct,
      ...(response.chosen ? { chosen: response.chosen } : {}),
      difficulty: item.difficulty,
      score_band: item.scoreBand,
      question_type: item.questionType,
      domain_code: item.domainCode,
      domain_name: item.domainName,
      skill_code: item.skillCode,
      skill_name: item.skillName,
    });
  }

  responseSnapshot.sort(
    (a, b) =>
      a.section.localeCompare(b.section) || a.module_number - b.module_number || a.ordinal - b.ordinal,
  );

  return {
    routes,
    formFingerprint: fingerprintParsedForm(parsed),
    responseSnapshot,
  };
}
