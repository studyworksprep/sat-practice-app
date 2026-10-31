import type { TypedSupabaseClient } from '../supabase/server.ts';
import { fetchAll } from '../supabase/fetchAll.js';
import { ACT_SECTIONS, sectionLabel, type ActSection } from './act-taxonomy.ts';

export type ActPracticeTaxonomyRow = {
  section: string | null;
  category: string | null;
  subcategory: string | null;
  question_count: number | string | null;
};

type CountedLabel = { name: string; count: number };
export type ActPracticeSection = {
  section: ActSection;
  name: string;
  count: number;
  categories: (CountedLabel & { subcategories: CountedLabel[] })[];
};

function largestFirst(a: CountedLabel, b: CountedLabel): number {
  return b.count - a.count || a.name.localeCompare(b.name);
}

/** Preserve the launcher's section/category totals, including unlabeled
 * questions that count toward a parent but have no selectable child. */
export function shapeActPracticeTaxonomy(rows: ActPracticeTaxonomyRow[]): ActPracticeSection[] {
  const sections = new Map<string, {
    count: number;
    categories: Map<string, { count: number; subcategories: Map<string, number> }>;
  }>();
  for (const row of rows) {
    if (!row.section) continue;
    const count = Number(row.question_count ?? 0);
    let section = sections.get(row.section);
    if (!section) {
      section = { count: 0, categories: new Map() };
      sections.set(row.section, section);
    }
    section.count += count;
    if (!row.category) continue;
    let category = section.categories.get(row.category);
    if (!category) {
      category = { count: 0, subcategories: new Map() };
      section.categories.set(row.category, category);
    }
    category.count += count;
    if (row.subcategory) {
      category.subcategories.set(row.subcategory,
        (category.subcategories.get(row.subcategory) ?? 0) + count);
    }
  }

  return ACT_SECTIONS.filter(section => sections.has(section)).map(section => {
    const entry = sections.get(section)!;
    return {
      section,
      name: sectionLabel(section),
      count: entry.count,
      categories: Array.from(entry.categories, ([name, category]) => ({
        name,
        count: category.count,
        subcategories: Array.from(category.subcategories, ([name, count]) => ({ name, count }))
          .sort(largestFirst),
      })).sort(largestFirst),
    };
  });
}

export async function loadActPracticeTaxonomy(supabase: Pick<TypedSupabaseClient, 'from'>) {
  // Order all grouping keys so pagination remains stable if the taxonomy
  // itself ever grows beyond PostgREST's row cap.
  const rows = await fetchAll(async (from, to) =>
    supabase.from('act_practice_taxonomy')
      .select('section, category, subcategory, question_count')
      .order('section', { ascending: true, nullsFirst: true })
      .order('category', { ascending: true, nullsFirst: true })
      .order('subcategory', { ascending: true, nullsFirst: true })
      .range(from, to),
  );
  return shapeActPracticeTaxonomy(rows);
}
