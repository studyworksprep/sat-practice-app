import { ACT_SECTIONS, isActSection, sectionLabel, type ActSection } from './act-taxonomy.ts';

export type ActSelection = { section: ActSection; category: string; subcategory?: string };
export type ActCategoryOption = {
  name: string;
  count: number;
  subcategories: Array<{ name: string; count: number }>;
};
export type ActSectionTaxonomy = { section: ActSection; label: string; categories: ActCategoryOption[] };

export function actSelectionKey(section: string, category: string, subcategory?: string): string {
  return JSON.stringify([section, category, subcategory ?? null]);
}

/** Older templates select whole categories; newer ones may select a child.
 * A whole category supersedes its children so sampling/counts never overlap. */
export function parseActSelections(raw: unknown): ActSelection[] {
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  const out: ActSelection[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const { section, category, subcategory } = entry;
    if (!isActSection(section) || typeof category !== 'string' || !category.trim()) continue;
    if (subcategory != null && typeof subcategory !== 'string') continue;
    const selection: ActSelection = { section, category: category.trim() };
    if (typeof subcategory === 'string' && subcategory.trim()) selection.subcategory = subcategory.trim();
    const key = actSelectionKey(selection.section, selection.category, selection.subcategory);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(selection);
  }
  return out.filter((selection) => !selection.subcategory
    || !seen.has(actSelectionKey(selection.section, selection.category)));
}

export function buildActAssignmentTaxonomy(rows: Array<{
  section: string | null;
  category?: string | null;
  subcategory?: string | null;
}>): ActSectionTaxonomy[] {
  return ACT_SECTIONS.map((section) => {
    const categories = new Map<string, { count: number; children: Map<string, number> }>();
    for (const row of rows) {
      if (row.section !== section) continue;
      const name = row.category?.trim() || '—';
      const category = categories.get(name) ?? { count: 0, children: new Map<string, number>() };
      category.count += 1;
      const child = row.subcategory?.trim();
      if (child) category.children.set(child, (category.children.get(child) ?? 0) + 1);
      categories.set(name, category);
    }
    return {
      section, label: sectionLabel(section),
      categories: [...categories].map(([name, category]) => ({
        name, count: category.count,
        subcategories: [...category.children].map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }).filter((section) => section.categories.length > 0);
}
