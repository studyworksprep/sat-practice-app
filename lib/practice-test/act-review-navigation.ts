import type { ActSection } from '../practice/act-taxonomy.ts';

export function actSectionReviewPath(attemptId: string, section: ActSection) {
  return `/practice/test/act/attempt/${attemptId}/review/${section}`;
}

export function scopeActReviewSession<T extends { question_ids: string[]; marked_positions?: number[] }>(
  session: T,
  sectionQuestionIds: string[],
): T {
  const allowed = new Set(sectionQuestionIds);
  const marked = new Set(session.marked_positions ?? []);
  const questionIds: string[] = [];
  const markedPositions: number[] = [];
  session.question_ids.forEach((questionId, position) => {
    if (!allowed.has(questionId)) return;
    if (marked.has(position)) markedPositions.push(questionIds.length);
    questionIds.push(questionId);
  });
  return { ...session, question_ids: questionIds, marked_positions: markedPositions };
}
