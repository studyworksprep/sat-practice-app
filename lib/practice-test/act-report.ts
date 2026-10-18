import { ACT_SECTIONS, sectionLabel } from '../practice/act-taxonomy.ts';

export type ActReportQuestion = { id: string; section: string; category?: string | null };
export type ActReportAnswer = {
  question_id: string;
  is_correct: boolean;
  created_at: string | null;
  time_spent_ms?: number | null;
};

export function buildActSectionRows(
  questionIds: string[],
  questions: ActReportQuestion[],
  answers: ActReportAnswer[],
  scores: Record<string, unknown>,
  finishedAt: string | null,
) {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const answerById = new Map<string, ActReportAnswer>();
  for (const answer of [...answers].sort((left, right) =>
    (left.created_at ?? '').localeCompare(right.created_at ?? ''),
  )) {
    if (finishedAt && (!answer.created_at || Date.parse(answer.created_at) > Date.parse(finishedAt))) continue;
    if (!answerById.has(answer.question_id)) answerById.set(answer.question_id, answer);
  }
  return ACT_SECTIONS.map((section) => {
    const categories = new Map<string, { name: string; total: number; correct: number }>();
    let total = 0;
    let correct = 0;
    let attempted = 0;
    let timeMs = 0;
    for (const questionId of new Set(questionIds)) {
      const question = questionById.get(questionId);
      if (question?.section !== section) continue;
      const answer = answerById.get(questionId);
      total += 1;
      if (answer) attempted += 1;
      if (answer?.is_correct) correct += 1;
      timeMs += Math.max(0, answer?.time_spent_ms ?? 0);
      const name = question.category || 'Uncategorized';
      const category = categories.get(name) ?? { name, total: 0, correct: 0 };
      category.total += 1;
      if (answer?.is_correct) category.correct += 1;
      categories.set(name, category);
    }
    const scaled = scores[`${section}_scaled`];
    return {
      section,
      label: sectionLabel(section),
      raw: { total, correct },
      attempted,
      timeMs,
      scaled: typeof scaled === 'number' && Number.isFinite(scaled) ? scaled : null,
      categories: [...categories.values()].sort((left, right) => left.name.localeCompare(right.name)),
    };
  }).filter((row) => row.raw.total > 0);
}
