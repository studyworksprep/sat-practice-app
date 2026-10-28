import { ACT_SECTIONS, sectionLabel } from './act-taxonomy';
import { SkillBreakdownCard } from './SkillBreakdownCard';
import type { ActReportCategory } from '../practice-test/act-report';

type CategoryMetric = { name: string; correct: number; total: number };
type SectionMetric = CategoryMetric & { code: string; skills?: CategoryMetric[]; categories?: ActReportCategory[] };

export function ActBreakdownCards({ domains }: { domains: SectionMetric[] }) {
  return ACT_SECTIONS.map((section) => {
    const domain = domains.find((entry) => entry.code === section);
    if (!domain) return null;
    const categories = domain.categories?.length ? domain.categories : domain.skills?.length ? domain.skills : [domain];
    return (
      <SkillBreakdownCard
        key={section}
        title={sectionLabel(section)}
        showPriorityLegend={false}
        tone={section === 'math' ? 'math' : 'rw'}
        domains={categories.map((category) => ({ ...category, skills: [category] }))}
      />
    );
  });
}
