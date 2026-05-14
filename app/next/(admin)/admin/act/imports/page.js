// Admin → ACT → Imports.
//
// Listing of every import job. The top action links to the
// upload page; the table below is sorted newest-first with a
// status pill per row + a "Open" link into the job-status page.
//
// PR 10a ships the listing + a delete affordance. The status
// page handles per-section parse button rendering in PR 10b.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { DeleteJobButton } from './DeleteJobButton';
import { deleteImportJob } from './actions';
import s from './Imports.module.css';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  uploaded: 'Uploaded',
  parsing: 'Parsing',
  ready_for_review: 'Ready for review',
  completed: 'Completed',
  failed: 'Failed',
};

export default async function ImportsListingPage() {
  let supabase;
  try {
    ({ supabase } = await requireRole(['admin']));
  } catch {
    redirect('/');
  }

  const { data: jobs } = await supabase
    .from('act_import_jobs')
    .select(
      'id, source_test, status, english_status, math_status, reading_status, science_status, scale_status, created_at',
    )
    .order('created_at', { ascending: false });

  return (
    <main className={s.container}>
      <header className={s.header}>
        <Link href="/admin" className={s.backLink}>← Admin</Link>
        <div className={s.titleRow}>
          <h1 className={s.h1}>ACT test imports</h1>
          <Link href="/admin/act/imports/new" className={s.btnPrimary}>
            + New import
          </Link>
        </div>
        <p className={s.sub}>
          Upload an ACT form, run the per-section parsers, and
          approve the drafts into <code>act_questions</code>.
          Each import is a separate job; re-importing the same
          form creates a new job rather than touching the old
          one so a botched parse can be deleted without losing
          history.
        </p>
      </header>

      {(jobs ?? []).length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyTitle}>No imports yet.</div>
          <div className={s.emptyBody}>
            Click <strong>+ New import</strong> to upload a test.
          </div>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>Source test</th>
                <th className={s.th}>Status</th>
                <th className={s.th}>Sections</th>
                <th className={s.th}>Created</th>
                <th className={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((j) => (
                <tr key={j.id}>
                  <td className={s.td}>
                    <Link href={`/admin/act/imports/${j.id}`} className={s.sourceTestLink}>
                      {j.source_test}
                    </Link>
                  </td>
                  <td className={s.td}>
                    <span className={`${s.statusPill} ${s[`statusPill_${j.status}`] ?? ''}`}>
                      {STATUS_LABEL[j.status] ?? j.status}
                    </span>
                  </td>
                  <td className={s.td}>
                    <SectionDots job={j} />
                  </td>
                  <td className={s.td}>{formatDate(j.created_at)}</td>
                  <td className={s.tdAction}>
                    <Link href={`/admin/act/imports/${j.id}`} className={s.openLink}>
                      Open →
                    </Link>
                    <DeleteJobButton
                      jobId={j.id}
                      sourceTest={j.source_test}
                      deleteAction={deleteImportJob}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

// Per-section dots so the listing shows at-a-glance progress
// without forcing a click into the status page. Each section's
// dot tone tracks its parser status.
function SectionDots({ job }) {
  const sections = [
    { key: 'english', label: 'E', status: job.english_status },
    { key: 'math',    label: 'M', status: job.math_status    },
    { key: 'reading', label: 'R', status: job.reading_status },
    { key: 'science', label: 'S', status: job.science_status },
    { key: 'scale',   label: 'X', status: job.scale_status   },
  ];
  return (
    <span className={s.dotsRow}>
      {sections.map((sec) => (
        <span
          key={sec.key}
          className={`${s.dot} ${s[`dot_${sec.status}`] ?? ''}`}
          title={`${sec.key}: ${sec.status}`}
          aria-label={`${sec.key}: ${sec.status}`}
        >
          {sec.label}
        </span>
      ))}
    </span>
  );
}
