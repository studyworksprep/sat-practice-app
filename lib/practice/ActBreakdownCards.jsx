import { ACT_SECTIONS, sectionLabel } from './act-taxonomy';
import { SkillBreakdownCard } from './SkillBreakdownCard';

export function ActBreakdownCards({ domains }) {
  return ACT_SECTIONS.map((section) => {
    const domain = domains.find((entry) => entry.code === section);
    if (!domain) return null;
    const categories = domain.skills?.length ? domain.skills : [domain];
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
