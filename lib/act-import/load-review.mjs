export const REVIEW_PAGE_SIZE = 20;
const STATUSES = ['ready_for_review', 'approved', 'rejected', 'parsing'];
const FIELDS = 'id, section, source_ordinal, stimulus_html, stem_html, rationale_html, ' +
  'difficulty, category, category_code, subcategory, subcategory_code, ' +
  'options_json, needs_figure, parse_warnings, status, approved_to_id, linked_existing';

// Keep full HTML and figures out of the job-wide counts. Every request is
// bounded so a stalled database produces a retryable error rather than an
// empty list that incorrectly tells the admin to replace their drafts.
export async function loadReview(supabase, jobId, search = {}) {
  const filter = STATUSES.includes(search.status) ? search.status : 'all';
  const results = await Promise.all(['all', ...STATUSES].map(async (status) => {
    let query = supabase.from('act_question_drafts')
      .select('id', { count: 'exact', head: true }).eq('import_job_id', jobId);
    if (status !== 'all') query = query.eq('status', status);
    const { count, error } = await query.abortSignal(AbortSignal.timeout(15000));
    if (error || count == null) throw new Error('Could not load draft counts', { cause: error });
    return [status, count];
  }));
  const counts = Object.fromEntries(results);
  const total = counts[filter];
  const pages = Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE));
  const requested = Number(search.page);
  const page = Math.min(pages, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  const offset = (page - 1) * REVIEW_PAGE_SIZE;
  let query = supabase.from('act_question_drafts').select(FIELDS).eq('import_job_id', jobId);
  if (filter !== 'all') query = query.eq('status', filter);
  const { data, error } = await query.order('section', { ascending: true })
    .order('source_ordinal', { ascending: true }).order('id', { ascending: true })
    .range(offset, offset + REVIEW_PAGE_SIZE - 1)
    .abortSignal(AbortSignal.timeout(15000));
  if (error || !data) throw new Error('Could not load drafts', { cause: error });
  return { drafts: data, counts, filter, page, pages, total, offset };
}
