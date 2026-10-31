import { sectionLabel } from './act-taxonomy.ts';

interface CategoryStat {
  code: string | null;
  name: string;
  correct: number;
  total: number;
}

interface SectionPerformance {
  section: string;
  label: string;
  correct: number;
  total: number;
  pct: number | null;
  categories: CategoryStat[];
}

export interface ActDashboardAggregate {
  totalAttempts: number;
  correctAttempts: number;
  weekAttempts: number;
  performance: {
    sections: SectionPerformance[];
    correct: number;
    total: number;
    pct: number | null;
  };
}

export interface ActDashboardRpcRow {
  total_attempts: number | string;
  correct_attempts: number | string;
  week_attempts: number | string;
  per_section: Array<{
    section: string;
    correct: number | string;
    total: number | string;
    categories: Array<{
      code: string | null;
      name: string;
      correct: number | string;
      total: number | string;
    }>;
  }> | null;
}

export function shapeActDashboardAggregate(row?: ActDashboardRpcRow): ActDashboardAggregate {
  const sections = (row?.per_section ?? []).map(s => {
    const correct = Number(s.correct);
    const total = Number(s.total);
    return {
      section: s.section,
      label: sectionLabel(s.section),
      correct,
      total,
      pct: total > 0 ? Math.round(correct / total * 100) : null,
      categories: s.categories.map(c => ({
        ...c, correct: Number(c.correct), total: Number(c.total),
      })),
    };
  });
  const correct = sections.reduce((sum, s) => sum + s.correct, 0);
  const total = sections.reduce((sum, s) => sum + s.total, 0);
  return {
    totalAttempts: Number(row?.total_attempts ?? 0),
    correctAttempts: Number(row?.correct_attempts ?? 0),
    weekAttempts: Number(row?.week_attempts ?? 0),
    performance: { sections, correct, total, pct: total > 0 ? Math.round(correct / total * 100) : null },
  };
}

export interface DashboardAccuracy {
  attempted: number;
  correct: number;
}

export function accuracyKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

export function dashboardAccuracyMetric(accuracy: DashboardAccuracy | undefined, questionCount: number): string {
  if (!accuracy?.attempted) return `${questionCount} questions`;
  return `${accuracy.correct} of ${accuracy.attempted} · ${Math.round(accuracy.correct / accuracy.attempted * 100)}%`;
}
