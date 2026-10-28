import { ACT_SECTIONS, isActSection, type ActSection } from './act-taxonomy.ts';
import { ACT_FORMAT_SPECS, isActFormat, parsePlan } from './act-test-plan.ts';

export type ActAssignmentScope = 'all' | ActSection | ActSection[];

export function parseActAssignmentScope(value: unknown): ActAssignmentScope | null {
  if (value == null || value === 'all') return 'all';
  if (Array.isArray(value)) {
    if (!value.length || !value.every(isActSection)) return null;
    return ACT_SECTIONS.filter(section => value.includes(section));
  }
  return isActSection(value) ? value : null;
}

export function actAssignmentScopeLabel(value: unknown): string {
  const scope = parseActAssignmentScope(value);
  if (!scope || scope === 'all') return 'Whole test';
  const sections = Array.isArray(scope) ? scope : [scope];
  return sections.map(section => section[0].toUpperCase() + section.slice(1)).join(', ') + (sections.length === 1 ? ' only' : '');
}

/** Resume only the exact section set, including student-selected combinations. */
export function matchesActSectionPlan(sections: unknown, requestedSections: unknown): boolean {
  const plan = parsePlan(sections);
  const requested = parsePlan(requestedSections);
  return requested.length > 0 && plan.length === requested.length
    && plan.every((section, index) => section.section === requested[index].section
      && section.time_limit_ms === requested[index].time_limit_ms);
}

/** A full attempt can satisfy a section assignment, but never the reverse. */
export function satisfiesActAssignmentScope(sections: unknown, format: unknown, value: unknown): boolean {
  const scope = parseActAssignmentScope(value);
  if (!scope) return false;
  const completed = new Set(parsePlan(sections).filter(s => s.status === 'completed').map(s => s.section));
  if (scope !== 'all') return (Array.isArray(scope) ? scope : [scope]).every(section => completed.has(section));
  const required = isActFormat(format) ? ACT_FORMAT_SPECS[format].compositeSections : ACT_SECTIONS;
  return required.every(section => completed.has(section));
}
