import type { SupabaseClient } from '@supabase/supabase-js';

// The REST API caps each response. Deduplicating just the first response
// silently hides forms added later in the bank.
export async function listActQuestionForms(supabase: SupabaseClient): Promise<string[]> {
  const forms = new Set<string>();
  const pageSize = 500;
  for (let offset = 0; ; ) {
    const { data, error } = await supabase
      .from('act_questions')
      .select('source_test')
      .not('source_test', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) if (row.source_test) forms.add(row.source_test);
    // Continue even if the server's configured cap is below pageSize.
    offset += data.length;
  }
  return [...forms].sort();
}
