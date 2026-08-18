// Pure validation and ordering rules for the admin curriculum-unit editor.
// Kept free of React/Supabase so Server Actions and node:test share the
// exact same contract.

const MATH_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

export interface CurriculumUnitSettingsInput {
  unitId: string;
  expectedMinutes: string;
  masteryThreshold: string;
}

export type NormalizedCurriculumUnitSettings =
  | { ok: true; value: { expectedMinutes: number; masteryThreshold: number } }
  | { ok: false; error: string };

function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

export function normalizeCurriculumUnitSettings(
  input: Pick<CurriculumUnitSettingsInput, 'expectedMinutes' | 'masteryThreshold'>,
): NormalizedCurriculumUnitSettings {
  const expectedMinutes = parseWholeNumber(input.expectedMinutes);
  if (expectedMinutes == null || expectedMinutes < 1) {
    return { ok: false, error: 'Expected minutes must be a whole number of 1 or more.' };
  }

  const masteryThreshold = parseWholeNumber(input.masteryThreshold);
  if (masteryThreshold == null || masteryThreshold < 0 || masteryThreshold > 100) {
    return { ok: false, error: 'Mastery threshold must be a whole number from 0 to 100.' };
  }

  return { ok: true, value: { expectedMinutes, masteryThreshold } };
}

export interface OrderedCurriculumUnit {
  id: string;
  domainCode: string;
  sequence: number;
}

export type CurriculumMovePlan =
  | { status: 'moved'; assignments: Array<{ id: string; sequence: number }> }
  | { status: 'boundary'; assignments: [] }
  | { status: 'not_found'; assignments: [] };

function isMathUnit(unit: Pick<OrderedCurriculumUnit, 'domainCode'>): boolean {
  return MATH_DOMAINS.has(unit.domainCode);
}

/**
 * Move one unit inside its SAT section and assign a clean global order:
 * all Math units first, then all Reading & Writing units. The returned
 * assignment list includes every row whose stored sequence needs repair.
 */
export function planCurriculumUnitMove(
  rows: readonly OrderedCurriculumUnit[],
  unitId: string,
  direction: 'up' | 'down',
): CurriculumMovePlan {
  const orderedInput = [...rows].sort(
    (a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id),
  );
  const current = orderedInput.find((row) => row.id === unitId);
  if (!current) return { status: 'not_found', assignments: [] };

  const math = orderedInput.filter(isMathUnit);
  const readingWriting = orderedInput.filter((row) => !isMathUnit(row));
  const section = isMathUnit(current) ? math : readingWriting;
  const index = section.findIndex((row) => row.id === unitId);
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= section.length) {
    return { status: 'boundary', assignments: [] };
  }

  [section[index], section[swapWith]] = [section[swapWith], section[index]];
  const assignments = [...math, ...readingWriting]
    .map((row, position) => ({ id: row.id, sequence: position + 1, previous: row.sequence }))
    .filter(({ sequence, previous }) => sequence !== previous)
    .map(({ id, sequence }) => ({ id, sequence }));

  return { status: 'moved', assignments };
}
