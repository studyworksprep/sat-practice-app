import type { PlanSection } from './generate-plan.ts';

export type SectionFocus = 'both' | PlanSection;

export const SECTION_LABELS = {
  both: 'Both sections (alternating units)',
  math: 'Math only',
  reading_writing: 'Reading and Writing only',
} as const;

export function isSectionFocus(value: unknown): value is SectionFocus {
  return typeof value === 'string' && Object.hasOwn(SECTION_LABELS, value);
}

export function storedSectionFocus(config: unknown): SectionFocus {
  const value = config && typeof config === 'object' && 'section_focus' in config
    ? config.section_focus : null;
  return isSectionFocus(value) ? value : 'both';
}
