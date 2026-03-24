import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/act/filters
// Returns { sections, categories } for ACT filter UI
export async function GET() {
  const supabase = createClient();

  try {
    // Fetch all distinct section + category + subcategory combos
    const { data: rows, error } = await supabase
      .from('act_questions')
      .select('section, category_code, category, subcategory_code, subcategory')
      .order('section')
      .limit(10000);

    if (error) throw error;

    // Build unique sections
    const sectionSet = new Set();
    const catMap = {}; // section -> { category_code -> { name, subcategories: [...] } }
    const countMap = {}; // section -> count

    for (const r of rows || []) {
      sectionSet.add(r.section);

      if (!countMap[r.section]) countMap[r.section] = 0;
      countMap[r.section]++;

      const key = r.category_code || r.category;
      if (!catMap[r.section]) catMap[r.section] = {};
      if (!catMap[r.section][key]) {
        catMap[r.section][key] = {
          category_code: r.category_code,
          category: r.category,
          count: 0,
          subcategories: {},
        };
      }
      catMap[r.section][key].count++;

      if (r.subcategory) {
        const skey = r.subcategory_code || r.subcategory;
        if (!catMap[r.section][key].subcategories[skey]) {
          catMap[r.section][key].subcategories[skey] = {
            subcategory_code: r.subcategory_code,
            subcategory: r.subcategory,
            count: 0,
          };
        }
        catMap[r.section][key].subcategories[skey].count++;
      }
    }

    const sections = Array.from(sectionSet).map((s) => ({
      section: s,
      count: countMap[s] || 0,
    }));

    // Flatten categories into array per section
    const categories = {};
    for (const [section, cats] of Object.entries(catMap)) {
      categories[section] = Object.values(cats).map((c) => ({
        ...c,
        subcategories: Object.values(c.subcategories),
      }));
    }

    return NextResponse.json({ sections, categories });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
