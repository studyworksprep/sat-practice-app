import type { TypedSupabaseClient } from '../supabase/server.ts';
import type { Row } from '../types/index.ts';
import { fetchAll } from '../supabase/fetchAll.js';
import { buildActAssignmentTaxonomy, type ActSectionTaxonomy } from '../practice/act-assignment-taxonomy.ts';
import { assessActQuestions } from '../practice/act-format-detection.ts';
import { actFormNamer, compareActForms } from '../practice/act-form-names.ts';
import { ACT_FORMAT_LABELS, isActFormat } from '../practice/act-test-plan.ts';
import type { ActSection } from '../practice/act-taxonomy.ts';

type Question = Pick<Row<'act_questions'>,
  'section' | 'category' | 'subcategory' | 'difficulty' | 'source_test' | 'source_ordinal'>;
type Form = Pick<Row<'act_forms'>, 'source_test' | 'format' | 'display_name'>;

export type ActAssignmentCatalog = {
  taxonomy: ActSectionTaxonomy[];
  difficulties: number[];
  forms: { sourceTest: string; label: string; sections: ActSection[] }[];
};

/** Keep the existing taxonomy, format and numbering checks. Group each
 * form once instead of repeatedly filtering the entire question bank. */
export function shapeActAssignmentCatalog(rows: Question[], forms: Form[]): ActAssignmentCatalog {
  const difficulties = new Set<number>();
  const byForm = new Map<string, Question[]>();
  for (const row of rows) {
    if (row.section && Number.isInteger(row.difficulty)) difficulties.add(row.difficulty!);
    if (row.source_test) {
      const group = byForm.get(row.source_test) ?? [];
      group.push(row);
      byForm.set(row.source_test, group);
    }
  }
  const formats = new Map(forms.filter(form => isActFormat(form.format))
    .map(form => [form.source_test, form.format]));
  const nameForm = actFormNamer(forms);
  const options: ActAssignmentCatalog['forms'] = [];
  for (const [sourceTest, questions] of byForm) {
    const count = questions.filter(question => question.section).length;
    const assessment = assessActQuestions(questions, { format: formats.get(sourceTest) });
    if (!count || assessment.reviewReason || !assessment.format) continue;
    options.push({
      sourceTest,
      sections: [...new Set(questions.map(question => question.section))] as ActSection[],
      label: `${nameForm(sourceTest)} · ${ACT_FORMAT_LABELS[assessment.format]} · ${count} question${count === 1 ? '' : 's'}`,
    });
  }
  options.sort((a, b) => compareActForms(a.sourceTest, b.sourceTest));
  return {
    taxonomy: buildActAssignmentTaxonomy(rows),
    difficulties: [...difficulties].sort((a, b) => a - b),
    forms: options,
  };
}

export async function loadActAssignmentCatalog(supabase: Pick<TypedSupabaseClient, 'from'>) {
  const [questions, { data: forms, error }] = await Promise.all([
    fetchAll(async (from, to) => supabase.from('act_questions')
      .select('section, category, subcategory, difficulty, source_test, source_ordinal')
      .eq('is_broken', false).is('deleted_at', null).order('id').range(from, to)),
    supabase.from('act_forms').select('source_test, format, display_name'),
  ]);
  if (error) throw error;
  return shapeActAssignmentCatalog(questions, forms ?? []);
}
