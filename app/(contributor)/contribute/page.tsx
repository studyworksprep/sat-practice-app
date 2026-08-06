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
import { tallyRecord, acceptanceRate, AUTO_VERIFY_MIN_PROMOTED } from '@/lib/bluebook/contributor-trust';
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
  auto_verified: {
    label: 'Accepted',
    className: s.pillVerified,
    blurb: 'Accepted on your track record, without waiting for a reviewer. Not yet folded into the scoring data.',
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
       auto_verified_at, html_artifact_path,
       practice_test:practice_tests_v2(name)`,
    )
    .eq('contributor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = submissions ?? [];
  const record = tallyRecord(rows.map((r) => ({ status: r.status as string })));
  const rate = acceptanceRate(record);
  // Same rule the server applies, stated to the contributor so the
  // threshold isn't a secret they have to infer from behaviour.
  const promotedShortfall = Math.max(0, AUTO_VERIFY_MIN_PROMOTED - record.promoted);
  const autoVerifying = promotedShortfall === 0 && record.rejected === 0;

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
        {record.total > 0 && (
          <span className={s.muted}>
            {record.total} sent · {record.promoted} in the scoring data
            {record.pending > 0 && ` · ${record.pending} awaiting review`}
            {rate != null && ` · ${rate}% accepted`}
          </span>
        )}
      </div>

      {record.total > 0 && (
        <p className={s.muted} style={{ marginTop: -8, marginBottom: 20 }}>
          {autoVerifying
            ? 'Your uploaded reports are now accepted without waiting for a reviewer. Anything hand-entered, or anything that disagrees with data we already hold, still gets read by a person.'
            : record.rejected > 0
              ? 'Uploaded reports go through a reviewer first. Get in touch if you think a rejection was a mistake.'
              : `Once ${promotedShortfall} more submission${promotedShortfall === 1 ? '' : 's'} ${
                  promotedShortfall === 1 ? 'has' : 'have'
                } made it into the scoring data, your uploaded reports will be accepted without waiting for a reviewer.`}
        </p>
      )}

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
          const key = row.status === 'verified' && row.auto_verified_at ? 'auto_verified' : row.status;
          const status = STATUS_COPY[key] ?? STATUS_COPY.pending;
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
        Not sure what to send, or got a report that won&rsquo;t parse?{' '}
        <Link href="/help">Get in touch</Link> — a file we can&rsquo;t read usually means
        College Board changed the report format, which is worth knowing about.
      </p>
    </main>
  );
}
