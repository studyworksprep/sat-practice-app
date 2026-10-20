import { ACT_SECTIONS, isActSection, type ActSection } from './act-taxonomy.ts';
import { ACT_FORMAT_SPECS, isActFormat, parsePlan } from './act-test-plan.ts';

export type ActAssignmentScope = 'all' | ActSection;

export function parseActAssignmentScope(value: unknown): ActAssignmentScope | null {
  if (value == null || value === 'all') return 'all';
  return isActSection(value) ? value : null;
}

export function actAssignmentScopeLabel(value: unknown): string {
  const scope = parseActAssignmentScope(value);
  return scope && scope !== 'all' ? `${scope[0].toUpperCase()}${scope.slice(1)} only` : 'Whole test';
}

/** Resume only the exact section set, including student-selected combinations. */
export function matchesActSectionPlan(sections: unknown, requestedSections: unknown): boolean {
  const plan = parsePlan(sections);
  const requested = parsePlan(requestedSections);
  return requested.length > 0 && plan.length === requested.length
    && plan.every((section, index) => section.section === requested[index].section);
}

/** A full attempt can satisfy a section assignment, but never the reverse. */
export function satisfiesActAssignmentScope(sections: unknown, format: unknown, value: unknown): boolean {
  const scope = parseActAssignmentScope(value);
  if (!scope) return false;
  const completed = new Set(parsePlan(sections).filter(s => s.status === 'completed').map(s => s.section));
  if (scope !== 'all') return completed.has(scope);
  const required = isActFormat(format) ? ACT_FORMAT_SPECS[format].compositeSections : ACT_SECTIONS;
  return required.every(section => completed.has(section));
}
