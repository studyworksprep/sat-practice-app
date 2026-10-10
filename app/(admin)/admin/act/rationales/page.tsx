// Admin → ACT → Rationales. The review surface for model-written
// rationales (Phase 2b): per-section coverage, a batch generator,
// and the draft queue with approve / reject / edit / regenerate.
//
// Workflow the page is built for:
//   1. Generate a batch for a section (5–10 at a time; each call
//      stays inside the function time limit).
//   2. Review a sample by hand — figure questions and anything the
//      validator flagged are always in that sample.
//   3. Bulk-approve the remaining clean drafts for the section.
//
// URL params: ?status=pending|approved|rejected (default pending)
//             ?section=…  ?form=…  ?review=1 (held for review only)
//             ?page=N (25 per page)

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { ACT_SECTIONS, sectionLabel } from '@/lib/practice/act-taxonomy';
import { RationaleControls } from './RationaleControls';
import { DraftCard, type DraftView } from './DraftCard';
import s from '../questions/ActQuestions.module.css';

export const dynamic = 'force-dynamic';
// Generation runs inside the page's Server Actions; the SAT
// generator route uses the same ceiling.
export const maxDuration = 60;

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v.trim() : '';
}

interface SectionStat {
  section: string;
  live: number;
  withRationale: number;
  pending: number;
  needsReview: number;
}

export default async function AdminActRationalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  let supabase;
  try {
    ({ supabase } = await requireRole(['admin']));
  } catch {
    redirect('/');
  }

  const statusParam = one(sp.status);
  const status = statusParam === 'approved' || statusParam === 'rejected' ? statusParam : 'pending';
  const section = one(sp.section);
  const form = one(sp.form);
  const reviewOnly = one(sp.review) === '1';
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Coverage: live questions and how many carry a rationale, per
  // section; pending / held drafts per section.
  const [{ data: liveRows }, { data: draftRows }, { data: formRows }] = await Promise.all([
    supabase
      .from('act_questions')
      .select('section, rationale_html')
      .is('deleted_at', null),
    supabase
      .from('act_rationale_drafts')
      .select('status, needs_review, question:act_questions!inner(section, deleted_at)')
      .eq('status', 'pending')
      .is('question.deleted_at', null),
    supabase
      .from('act_questions')
      .select('source_test')
      .is('deleted_at', null)
      .not('source_test', 'is', null),
  ]);

  const stats = new Map<string, SectionStat>(
    ACT_SECTIONS.map((sec) => [sec, { section: sec, live: 0, withRationale: 0, pending: 0, needsReview: 0 }]),
  );
  for (const r of (liveRows ?? []) as Array<{ section: string; rationale_html: string | null }>) {
    const st = stats.get(r.section);
    if (!st) continue;
    st.live += 1;
    if (r.rationale_html && r.rationale_html.trim() !== '') st.withRationale += 1;
  }
  for (const d of (draftRows ?? []) as Array<{ needs_review: boolean; question: { section: string } | null }>) {
    const st = d.question ? stats.get(d.question.section) : null;
    if (!st) continue;
    st.pending += 1;
    if (d.needs_review) st.needsReview += 1;
  }
  const forms = Array.from(
    new Set(((formRows ?? []) as Array<{ source_test: string | null }>).map((r) => r.source_test).filter(Boolean) as string[]),
  ).sort();

  // Draft queue.
  let q = supabase
    .from('act_rationale_drafts')
    .select(
      `id, question_id, rationale_html, answer_letter, confidence, model_notes, model, prompt_version,
       status, needs_review, warnings, created_at, updated_at,
       question:act_questions!inner(id, section, category, source_test, source_ordinal, stimulus_html, stem_html, rationale_html, deleted_at)`,
      { count: 'exact' },
    )
    .eq('status', status)
    .is('question.deleted_at', null);
  if (section) q = q.eq('question.section', section);
  if (form) q = q.eq('question.source_test', form);
  if (reviewOnly) q = q.eq('needs_review', true);

  const { data: drafts, count, error } = await q
    .order('needs_review', { ascending: false })
    .order('created_at', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  const draftList = (drafts ?? []) as unknown as DraftView[];
  const questionIds = draftList.map((d) => d.question_id);
  const { data: optionRows } = questionIds.length > 0
    ? await supabase
        .from('act_answer_options')
        .select('question_id, label, content_html, is_correct')
        .in('question_id', questionIds)
        .order('label', { ascending: true })
    : { data: [] };
  const optionsByQ = new Map<string, DraftView['options']>();
  for (const o of (optionRows ?? []) as Array<{ question_id: string; label: string; content_html: string; is_correct: boolean }>) {
    const arr = optionsByQ.get(o.question_id) ?? [];
    arr.push({ label: o.label, content_html: o.content_html, is_correct: o.is_correct });
    optionsByQ.set(o.question_id, arr);
  }
  for (const d of draftList) d.options = optionsByQ.get(d.question_id) ?? [];

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filters = { status, section, form, reviewOnly };

  return (
    <main className={s.container}>
      <header className={s.header}>
        <Link href="/admin" className={s.backLink}>← Admin</Link>
        <div className={s.titleRow}>
          <h1 className={s.h1}>ACT rationales</h1>
          <div className={s.actions}>
            <Link href="/admin/act/questions" className={s.btnSecondary}>Questions</Link>
          </div>
        </div>
        <p className={s.sub}>
          Generate explanations for ACT questions in small batches, review a
          sample per section (figure questions and anything the validator
          flagged are always in it), then bulk-approve the rest. Approving
          writes the text onto the question; students see it after answering.
        </p>
      </header>

      <section className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.th}>Section</th>
              <th className={`${s.th} ${s.tdNum}`}>Live questions</th>
              <th className={`${s.th} ${s.tdNum}`}>With rationale</th>
              <th className={`${s.th} ${s.tdNum}`}>Pending drafts</th>
              <th className={`${s.th} ${s.tdNum}`}>Held for review</th>
            </tr>
          </thead>
          <tbody>
            {ACT_SECTIONS.map((sec) => {
              const st = stats.get(sec)!;
              return (
                <tr key={sec}>
                  <td className={s.td}>{sectionLabel(sec)}</td>
                  <td className={`${s.td} ${s.tdNum}`}>{st.live}</td>
                  <td className={`${s.td} ${s.tdNum}`}>
                    {st.withRationale}
                    {st.live > 0 ? ` (${Math.round((st.withRationale / st.live) * 100)}%)` : ''}
                  </td>
                  <td className={`${s.td} ${s.tdNum}`}>{st.pending}</td>
                  <td className={`${s.td} ${s.tdNum}`}>{st.needsReview}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <RationaleControls forms={forms} />

      <form action="/admin/act/rationales" method="get" className={s.filterBar}>
        <select name="status" defaultValue={status} className={s.select} aria-label="Draft status">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select name="section" defaultValue={section} className={s.select} aria-label="Section">
          <option value="">All sections</option>
          {ACT_SECTIONS.map((sec) => <option key={sec} value={sec}>{sectionLabel(sec)}</option>)}
        </select>
        <select name="form" defaultValue={form} className={s.select} aria-label="Form">
          <option value="">All forms</option>
          {forms.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <label className={s.toggle}>
          <input type="checkbox" name="review" value="1" defaultChecked={reviewOnly} />
          Held for review only
        </label>
        <button type="submit" className={s.btnSecondary}>Apply</button>
        <span className={s.fieldHint}>
          {error ? `Query failed: ${error.message}` : `${total} draft${total === 1 ? '' : 's'} · page ${page} of ${lastPage}`}
        </span>
      </form>

      {draftList.length === 0 ? (
        <div className={s.empty}>
          {status === 'pending'
            ? 'No pending drafts in this scope. Generate a batch above.'
            : `No ${status} drafts in this scope.`}
        </div>
      ) : (
        draftList.map((d) => <DraftCard key={d.id} draft={d} />)
      )}

      {lastPage > 1 && (
        <nav className={s.pagination} aria-label="Pagination">
          {page > 1
            ? <Link href={toUrl(filters, page - 1)} className={s.pageLink}>← Previous</Link>
            : <span className={s.pageLinkDisabled}>← Previous</span>}
          <span>Page {page} of {lastPage}</span>
          {page < lastPage
            ? <Link href={toUrl(filters, page + 1)} className={s.pageLink}>Next →</Link>
            : <span className={s.pageLinkDisabled}>Next →</span>}
        </nav>
      )}
    </main>
  );
}

function toUrl(
  f: { status: string; section: string; form: string; reviewOnly: boolean },
  page: number,
): string {
  const p = new URLSearchParams();
  if (f.status !== 'pending') p.set('status', f.status);
  if (f.section) p.set('section', f.section);
  if (f.form) p.set('form', f.form);
  if (f.reviewOnly) p.set('review', '1');
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  return qs ? `/admin/act/rationales?${qs}` : '/admin/act/rationales';
}
