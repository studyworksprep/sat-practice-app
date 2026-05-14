// Admin → ACT → Imports → [jobId] → Review.
//
// Listing of every draft produced by the per-section parsers
// (PR 10b), grouped by section, with approve / reject / edit
// affordances per row plus a section-level bulk-approve.
//
// Drafts whose status is "approved" land on act_questions; the
// "Finalize job" button at the bottom flips the job's top-level
// status to "completed" once nothing is left in the ready-for-
// review or parsing buckets.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { sectionLabel, ACT_SECTIONS } from '@/lib/practice/act-taxonomy';
import { DraftCard } from './DraftCard';
import { BulkApproveButton, FinalizeJobButton } from './BulkButtons';
import {
  saveDraft,
  approveDraft,
  rejectDraft,
  unapproveDraft,
  bulkApprove,
  finalizeJob,
} from './actions';
import s from './Review.module.css';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  parsing: 'Parsing',
  ready_for_review: 'Ready',
  approved: 'Approved',
  rejected: 'Rejected',
};

export default async function ReviewPage({ params, searchParams }) {
  const { jobId } = await params;
  const sp = (await searchParams) ?? {};
  const filter = typeof sp.status === 'string' ? sp.status : 'all';

  let supabase;
  try {
    ({ supabase } = await requireRole(['admin']));
  } catch {
    redirect('/');
  }

  const { data: job } = await supabase
    .from('act_import_jobs')
    .select('id, source_test, status')
    .eq('id', jobId)
    .maybeSingle();
  if (!job) notFound();

  const { data: drafts } = await supabase
    .from('act_question_drafts')
    .select(
      'id, section, source_ordinal, stimulus_html, stem_html, rationale_html, ' +
      'difficulty, category, category_code, subcategory, subcategory_code, ' +
      'options_json, needs_figure, parse_warnings, status, approved_to_id',
    )
    .eq('import_job_id', jobId)
    .order('section', { ascending: true })
    .order('source_ordinal', { ascending: true });

  const all = drafts ?? [];

  // Counts across the whole job — used for the filter chips +
  // the "X of Y" header on each section.
  const counts = {
    all: all.length,
    ready_for_review: 0,
    approved: 0,
    rejected: 0,
    parsing: 0,
  };
  for (const d of all) counts[d.status] = (counts[d.status] ?? 0) + 1;

  // Filter for the visible subset.
  const visible = filter === 'all' ? all : all.filter((d) => d.status === filter);

  const bySection = new Map();
  for (const sec of ACT_SECTIONS) bySection.set(sec, []);
  for (const d of visible) {
    if (!bySection.has(d.section)) bySection.set(d.section, []);
    bySection.get(d.section).push(d);
  }

  const allDone = counts.ready_for_review === 0 && counts.parsing === 0 && counts.all > 0;

  return (
    <main className={s.container}>
      <header className={s.header}>
        <Link href={`/admin/act/imports/${jobId}`} className={s.backLink}>
          ← Job status
        </Link>
        <div className={s.titleRow}>
          <div>
            <h1 className={s.h1}>{job.source_test}</h1>
            <p className={s.sub}>
              {counts.all} draft{counts.all === 1 ? '' : 's'} ·{' '}
              {counts.approved} approved · {counts.ready_for_review} pending ·{' '}
              {counts.rejected} rejected
            </p>
          </div>
          {allDone && job.status !== 'completed' && (
            <FinalizeJobButton jobId={jobId} action={finalizeJob} />
          )}
        </div>
        <FilterChips jobId={jobId} active={filter} counts={counts} />
      </header>

      {visible.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyTitle}>No drafts in this view.</div>
          <div className={s.emptyBody}>
            {counts.all === 0
              ? 'Run a section parser on the job page to produce drafts.'
              : 'Switch the filter above to see drafts in other states.'}
          </div>
        </div>
      ) : (
        Array.from(bySection.entries())
          .filter(([, list]) => list.length > 0)
          .map(([section, list]) => (
            <section key={section} className={s.section}>
              <div className={s.sectionHeader}>
                <div className={s.sectionTitle}>
                  {sectionLabel(section)}{' '}
                  <span className={s.sectionCount}>· {list.length}</span>
                </div>
                <BulkApproveButton
                  jobId={jobId}
                  section={section}
                  action={bulkApprove}
                  disabled={list.every((d) => d.status !== 'ready_for_review')}
                />
              </div>
              <ul className={s.draftList}>
                {list.map((d) => (
                  <li key={d.id}>
                    <DraftCard
                      jobId={jobId}
                      draft={d}
                      statusLabel={STATUS_LABEL[d.status] ?? d.status}
                      saveAction={saveDraft}
                      approveAction={approveDraft}
                      rejectAction={rejectDraft}
                      unapproveAction={unapproveDraft}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}
    </main>
  );
}

function FilterChips({ jobId, active, counts }) {
  const chips = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'ready_for_review', label: 'Pending', n: counts.ready_for_review },
    { key: 'approved', label: 'Approved', n: counts.approved },
    { key: 'rejected', label: 'Rejected', n: counts.rejected },
  ];
  return (
    <div className={s.chips}>
      {chips.map((c) => (
        <Link
          key={c.key}
          href={
            c.key === 'all'
              ? `/admin/act/imports/${jobId}/review`
              : `/admin/act/imports/${jobId}/review?status=${c.key}`
          }
          className={`${s.chip} ${active === c.key ? s.chipActive : ''}`}
        >
          {c.label} <span className={s.chipCount}>{c.n}</span>
        </Link>
      ))}
    </div>
  );
}
