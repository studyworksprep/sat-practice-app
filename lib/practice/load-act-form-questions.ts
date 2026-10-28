import { visibleActQuestions } from './act-visibility.ts';
import { fetchAll } from '../supabase/fetchAll.js';

// Always paginate and order by a unique key. Counts must not depend on the
// API row limit or on which forms happen to be returned first.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadActFormQuestions(supabase: any, sourceTest?: string) {
  const data = await fetchAll<{ id: string; source_test: string; section: string; source_ordinal: number | null }>((from, to) => {
    let query = visibleActQuestions(supabase.from('act_questions').select('id, source_test, section, source_ordinal')).not('source_test', 'is', null);
    if (sourceTest) query = query.eq('source_test', sourceTest);
    return query.order('id').range(from, to);
  });
  return { data };
}
