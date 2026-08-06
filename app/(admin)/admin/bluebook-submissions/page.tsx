// Review queue for contributed Bluebook submissions.
//
// Two things a reviewer needs that a plain list doesn't give them:
//
//   * the flags the validation trigger already raised, in words — a
//     conversion conflict is the one finding that must never be
//     rubber-stamped, because accepting it silently would overwrite a
//     curve that some other official report vouches for;
//   * the contributor's track record, so "this person's last 20 were
//     all fine" is visible at the moment of deciding.
//
// Read with the admin's own client. The self-review rule lives in RLS
// (contributor_id <> auth.uid()), so a submission the admin made
// themselves is listed but its actions come back refused — the page
// says so up front rather than letting them find out by clicking.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { tallyRecord, EMPTY_RECORD } from '@/lib/bluebook/contributor-trust';
import { ReviewQueue, type QueueRow } from './ReviewQueue';
import a from '../../admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminBluebookSubmissionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const showAll = sp.filter === 'all';

  const { user, profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  let query = supabase
    .from('bluebook_submissions')
    .select(
      `id, contributor_id, status, entry_method, created_at, report_date, subject_label,
       rw_m1_correct, rw_m2_correct, rw_scaled,
       math_m1_correct, math_m2_correct, math_scaled,
       html_artifact_path, validation_flags, review_note, attempt_id, auto_verified_at,
       practice_test:practice_tests_v2(name),
       contributor:profiles!bluebook_submissions_contributor_id_fkey(first_name, last_name, email, role)`,
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (!showAll) query = query.in('status', ['pending', 'verified']);

  const { data: submissions } = await query;
  const rows = submissions ?? [];

  // Track record per contributor, over every submission they've ever
  // sent — not just the ones on this page.
  const contributorIds = [...new Set(rows.map((r) => r.contributor_id as string))];
  const { data: history } = contributorIds.length
    ? await supabase
        .from('bluebook_submissions')
        .select('contributor_id, status')
        .in('contributor_id', contributorIds)
    : { data: [] };

  // Tallied with the same helper the auto-verify rule uses, so what a
  // reviewer reads on the card and what the rule acted on can't drift.
  const byContributor = new Map<string, Array<{ status: string }>>();
  for (const h of history ?? []) {
    const id = h.contributor_id as string;
    const list = byContributor.get(id) ?? [];
    list.push({ status: h.status as string });
    byContributor.set(id, list);
  }
  const record = new Map(
    [...byContributor.entries()].map(([id, rows]) => [id, tallyRecord(rows)]),
  );

  const queueRows: QueueRow[] = rows.map((r) => {
    const test = Array.isArray(r.practice_test) ? r.practice_test[0] : r.practice_test;
    const who = Array.isArray(r.contributor) ? r.contributor[0] : r.contributor;
    const stats = record.get(r.contributor_id as string) ?? EMPTY_RECORD;

    return {
      id: r.id as string,
      status: r.status as string,
      entryMethod: r.entry_method as string,
      testName: (test?.name as string) ?? 'Practice test',
      createdAt: formatDate(r.created_at as string),
      reportDate: r.report_date ? formatDate(r.report_date as string) : null,
      subjectLabel: (r.subject_label as string) ?? null,
      rw: {
        m1: r.rw_m1_correct as number | null,
        m2: r.rw_m2_correct as number | null,
        scaled: r.rw_scaled as number | null,
      },
      math: {
        m1: r.math_m1_correct as number | null,
        m2: r.math_m2_correct as number | null,
        scaled: r.math_scaled as number | null,
      },
      hasArtifact: Boolean(r.html_artifact_path),
      autoVerified: Boolean(r.auto_verified_at),
      linkedAttempt: Boolean(r.attempt_id),
      flags: Array.isArray(r.validation_flags) ? (r.validation_flags as unknown[]) : [],
      reviewNote: (r.review_note as string) ?? null,
      contributorName:
        [who?.first_name, who?.last_name].filter(Boolean).join(' ') ||
        (who?.email as string) ||
        'Unknown contributor',
      contributorRole: (who?.role as string) ?? '',
      isOwnSubmission: (r.contributor_id as string) === user.id,
      record: stats,
    };
  });

  const pending = queueRows.filter((r) => r.status === 'pending').length;
  const verified = queueRows.filter((r) => r.status === 'verified').length;

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href="/admin">← Admin</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Contributions</div>
        <h1 className={a.h1}>Bluebook submissions</h1>
        <p className={a.sub}>
          Contributed official results, waiting to be folded into the scoring curves.
          Verify what checks out, then promote it — promotion is the only path that writes{' '}
          <code>score_conversion</code>, and every row it writes carries the submission it
          came from. A section that conflicts with an existing curve is never overwritten;
          it&rsquo;s skipped and reported.
        </p>
      </header>

      <ReviewQueue
        rows={queueRows}
        pendingCount={pending}
        verifiedCount={verified}
        showAll={showAll}
      />
    </main>
  );
}
