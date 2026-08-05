// The contributor's own submissions.
//
// Read through the caller's RLS-scoped client, so this is literally
// "rows where contributor_id = auth.uid()" — staff who are also
// reviewers see their own contributions here and everyone else's in the
// admin queue, which is the separation the review gate depends on.

import Link from 'next/link';
import { requireUserPage } from '@/lib/api/auth';
import { redirect } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { formatDate } from '@/lib/formatters';
import s from './Contribute.module.css';

export const dynamic = 'force-dynamic';

const STATUS_COPY: Record<string, { label: string; className: string; blurb: string }> = {
  pending: {
    label: 'Pending review',
    className: s.pillPending,
    blurb: 'Waiting for a reviewer.',
  },
  verified: {
    label: 'Verified',
    className: s.pillVerified,
    blurb: 'Checked and accepted; not yet folded into the scoring data.',
  },
  promoted: {
    label: 'Promoted',
    className: s.pillPromoted,
    blurb: 'Folded into the scoring data. Thank you — this is the finish line.',
  },
  rejected: {
    label: 'Not accepted',
    className: s.pillRejected,
    blurb: 'A reviewer found a problem. See their note.',
  },
};

const FLAG_COPY: Record<string, string> = {
  conversion_conflict:
    'Another official report gave a different scaled score for these same module counts. A reviewer will look at both.',
  route_inconsistent:
    "The module 1 count doesn't match the module 2 form recorded for this section.",
  route_check_skipped:
    'This test has no routing threshold on file, so the module 2 check was skipped.',
};

const ENTRY_METHOD_COPY: Record<string, string> = {
  html_upload: 'Score report',
  attempt_link: 'Linked to an in-app test',
  manual_grid: 'Entered by hand',
};

export default async function ContributePage() {
  const { user, profile, supabase } = await requireUserPage();

  const isStaff = ['teacher', 'manager', 'admin'].includes(profile.role);
  if (!isStaff && profile.role !== 'contributor') redirect('/');

  const { data: submissions } = await supabase
    .from('bluebook_submissions')
    .select(
      `id, status, entry_method, created_at, report_date, subject_label,
       rw_scaled, math_scaled, validation_flags, review_note,
       practice_test:practice_tests_v2(name)`,
    )
    .eq('contributor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = submissions ?? [];
  const promoted = rows.filter((r) => r.status === 'promoted').length;
  const reviewed = rows.filter((r) => r.status !== 'pending').length;

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Contribute</div>
        <h1 className={s.h1}>Bluebook contributions</h1>
        <p className={s.sub}>
          Official Bluebook results are what let Studyworks turn a raw score into an
          accurate scaled score. Every report you send makes the estimate better for
          everyone. Never include a student&rsquo;s name — use a label like
          &ldquo;Student A&rdquo; if you need to tell your own submissions apart.
        </p>
      </header>

      <div className={s.actions} style={{ marginTop: 0, marginBottom: 20 }}>
        <Button href="/contribute/new">New submission</Button>
        {rows.length > 0 && (
          <span className={s.muted}>
            {rows.length} submitted · {promoted} promoted
            {reviewed > 0 && ` · ${reviewed} reviewed`}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className={s.card}>
          <p style={{ margin: 0 }}>You haven&rsquo;t sent anything yet.</p>
          <p className={s.muted} style={{ marginTop: 8, marginBottom: 0 }}>
            The quickest route is the saved score report: open the test in My Practice on
            the College Board site, save the Details page as HTML, and upload it. Nothing
            to type in but the two section scores.
          </p>
        </div>
      ) : (
        rows.map((row) => {
          const status = STATUS_COPY[row.status] ?? STATUS_COPY.pending;
          const test = Array.isArray(row.practice_test) ? row.practice_test[0] : row.practice_test;
          const flags = Array.isArray(row.validation_flags) ? row.validation_flags : [];

          return (
            <article key={row.id} className={s.card}>
              <div className={s.cardHeader}>
                <div>
                  <strong>{test?.name ?? 'Practice test'}</strong>
                  {row.subject_label && <span className={s.muted}> · {row.subject_label}</span>}
                </div>
                <span className={`${s.pill} ${status.className}`}>{status.label}</span>
              </div>

              <div className={s.muted}>
                {ENTRY_METHOD_COPY[row.entry_method] ?? row.entry_method}
                {' · sent '}
                {formatDate(row.created_at)}
                {row.report_date && ` · taken ${formatDate(row.report_date)}`}
              </div>

              <div style={{ marginTop: 8 }}>
                {row.rw_scaled != null && <span>R&amp;W <strong>{row.rw_scaled}</strong></span>}
                {row.rw_scaled != null && row.math_scaled != null && <span> · </span>}
                {row.math_scaled != null && <span>Math <strong>{row.math_scaled}</strong></span>}
              </div>

              <p className={s.muted} style={{ marginTop: 8 }}>{status.blurb}</p>

              {row.review_note && (
                <p className={s.muted} style={{ marginTop: 4 }}>
                  Reviewer: {row.review_note}
                </p>
              )}

              {flags.length > 0 && (
                <ul className={s.flagList}>
                  {flags.map((flag: unknown, i: number) => {
                    const code = (flag as { code?: string })?.code ?? '';
                    return <li key={i}>{FLAG_COPY[code] ?? code}</li>;
                  })}
                </ul>
              )}
            </article>
          );
        })
      )}

      <p className={s.muted} style={{ marginTop: 24 }}>
        Questions about what to send, or a report that won&rsquo;t parse?{' '}
        <Link href="/help">Get in touch</Link>.
      </p>
    </main>
  );
}
