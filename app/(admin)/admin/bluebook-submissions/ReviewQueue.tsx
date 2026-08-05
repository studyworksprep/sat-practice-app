'use client';

// The reviewer's working surface.
//
// Every action here is a Server Action that re-checks its own
// permissions; the disabled states below are ergonomics, not security.
// The one that matters most is `isOwnSubmission`: RLS refuses a review
// of your own contribution, and saying so on the card is friendlier
// than letting someone write a note and then bounce.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import {
  reviewSubmission,
  promoteSubmission,
  artifactDownloadUrl,
  type PromotionResult,
} from '@/lib/bluebook/submission-actions';
import { acceptanceRate, type ContributorRecord } from '@/lib/bluebook/contributor-trust';
import s from '../../forms.module.css';

export interface QueueRow {
  id: string;
  status: string;
  entryMethod: string;
  testName: string;
  createdAt: string;
  reportDate: string | null;
  subjectLabel: string | null;
  rw: { m1: number | null; m2: number | null; scaled: number | null };
  math: { m1: number | null; m2: number | null; scaled: number | null };
  hasArtifact: boolean;
  autoVerified: boolean;
  linkedAttempt: boolean;
  flags: unknown[];
  reviewNote: string | null;
  contributorName: string;
  contributorRole: string;
  isOwnSubmission: boolean;
  record: ContributorRecord;
}

const ENTRY_METHOD_LABEL: Record<string, string> = {
  html_upload: 'Score report',
  attempt_link: 'Linked attempt',
  manual_grid: 'Hand-entered grid',
};

// How much a reviewer should trust each entry method before looking at
// anything else. Stated plainly because it's the whole basis of the
// trust tiers, and a reviewer working through a queue at speed should
// not have to reconstruct it each time.
const ENTRY_METHOD_WEIGHT: Record<string, string> = {
  html_upload: 'Report attached — the counts were read from the file, not typed.',
  attempt_link: 'Answers came from the in-app attempt; only the scores were typed.',
  manual_grid: 'Every answer was typed. Nothing corroborates it but the checksum.',
};

/** A section's counts and score. Both module counts have to be present
 *  for the pair to mean anything — the conversion key is (m1, m2), and
 *  a half-filled submission is exactly the kind that isn't promotable,
 *  so it's shown as incomplete rather than as "1+". */
function SectionLine({
  label, section,
}: { label: string; section: { m1: number | null; m2: number | null; scaled: number | null } }) {
  if (section.scaled == null) return null;
  const complete = section.m1 != null && section.m2 != null;
  return (
    <span>
      {label}{' '}
      {complete
        ? <>{section.m1}+{section.m2} → </>
        : <em style={{ opacity: 0.7 }}>(module counts incomplete) </em>}
      <strong>{section.scaled}</strong>
    </span>
  );
}

function describeFlag(flag: unknown): { text: string; severe: boolean } {
  const f = flag as Record<string, unknown>;
  switch (f?.code) {
    case 'conversion_conflict':
      return {
        severe: true,
        text:
          `Conflicts with an existing curve: ${f.section} at ${f.module1_correct}+${f.module2_correct} ` +
          `is already recorded as ${f.existing_scaled}, this submission says ${f.submitted_scaled}. ` +
          `Promotion will skip this section rather than overwrite it.`,
      };
    case 'route_inconsistent':
      return {
        severe: true,
        text:
          `Module 2 routing doesn't line up: ${f.module1_correct} correct in module 1 with a ` +
          `threshold of ${f.threshold} should have produced the "${f.expected_route}" module, ` +
          `but the submission reports "${f.reported_route}".`,
      };
    case 'route_check_skipped':
      return {
        severe: false,
        text: `Routing check skipped for ${f.section} — this test has no threshold on file.`,
      };
    default:
      return { severe: false, text: JSON.stringify(flag) };
  }
}

export function ReviewQueue({
  rows, pendingCount, verifiedCount, showAll,
}: {
  rows: QueueRow[];
  pendingCount: number;
  verifiedCount: number;
  showAll: boolean;
}) {
  return (
    <>
      <div className={s.row} style={{ marginBottom: 16, alignItems: 'center', gap: 12 }}>
        <span className={s.muted}>
          {pendingCount} pending · {verifiedCount} verified and ready to promote
        </span>
        <a
          className={s.hint}
          href={showAll ? '/admin/bluebook-submissions' : '/admin/bluebook-submissions?filter=all'}
        >
          {showAll ? 'Show only open items' : 'Show everything, including promoted and rejected'}
        </a>
      </div>

      {rows.length === 0 ? (
        <p className={s.empty}>Nothing in the queue.</p>
      ) : (
        rows.map((row) => <SubmissionCard key={row.id} row={row} />)
      )}
    </>
  );
}

function SubmissionCard({ row }: { row: QueueRow }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<PromotionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const flags = row.flags.map(describeFlag);
  const severe = flags.some((f) => f.severe);
  const acceptRate = acceptanceRate(row.record);

  function act(fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>) {
    setError(null); setMessage(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? 'That did not work');
      router.refresh();
    });
  }

  function review(decision: 'verified' | 'rejected') {
    act(async () => {
      const res = await reviewSubmission({ submissionId: row.id, decision, note });
      if (res.ok) setMessage(decision === 'verified' ? 'Verified.' : 'Rejected.');
      return res;
    });
  }

  function promote() {
    setError(null); setMessage(null);
    startTransition(async () => {
      const res = await promoteSubmission({ submissionId: row.id });
      if (!res.ok) return setError(res.error);
      setPromotion(res.data);
      setMessage(
        res.data!.conversionsWritten === 1
          ? '1 conversion row written.'
          : `${res.data!.conversionsWritten} conversion rows written.`,
      );
      router.refresh();
    });
  }

  function openArtifact() {
    setError(null);
    startTransition(async () => {
      const res = await artifactDownloadUrl({ submissionId: row.id });
      if (!res.ok) return setError(res.error);
      // Downloaded, never navigated to: the file is untrusted HTML from
      // a contributor and must not render in this origin.
      window.location.href = res.data!.url;
    });
  }

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: severe ? '3px solid #b26b00' : '1px solid var(--border)',
        borderRadius: 8,
        padding: 14,
        marginBottom: 12,
        background: 'var(--card)',
      }}
    >
      <div className={s.row} style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <strong>{row.testName}</strong>
          {row.subjectLabel && <span className={s.muted}> · {row.subjectLabel}</span>}
          <div className={s.muted}>
            {row.contributorName}
            {row.contributorRole && ` (${row.contributorRole})`}
            {' · sent '}{row.createdAt}
            {row.reportDate && ` · taken ${row.reportDate}`}
          </div>
        </div>
        <span className={s.hint}>
          {row.autoVerified && row.status === 'verified' ? 'verified by rule' : row.status}
        </span>
      </div>

      <div className={s.muted} style={{ marginTop: 8 }}>
        <strong>{ENTRY_METHOD_LABEL[row.entryMethod] ?? row.entryMethod}</strong>
        {' — '}
        {ENTRY_METHOD_WEIGHT[row.entryMethod] ?? ''}
      </div>

      <div style={{ marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
        <SectionLine label="R&amp;W" section={row.rw} />
        {row.rw.scaled != null && row.math.scaled != null && <span> · </span>}
        <SectionLine label="Math" section={row.math} />
      </div>

      <div className={s.muted} style={{ marginTop: 6 }}>
        Contributor record: {row.record.total} sent, {row.record.promoted} promoted
        {row.record.rejected > 0 && `, ${row.record.rejected} rejected`}
        {acceptRate != null ? ` (${acceptRate}% of decided)` : ' — nothing decided yet'}
      </div>

      {row.autoVerified && (
        <p className={s.muted} style={{ marginTop: 6 }}>
          Verified by the trust rule, not by a person: the report is attached, nothing
          severe was flagged, and this contributor has a clean record. Promotion is still
          yours to make — read the report first if anything here looks off.
        </p>
      )}

      {flags.length > 0 && (
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
          {flags.map((f, i) => (
            <li key={i} style={{ color: f.severe ? '#b26b00' : 'var(--fg2)' }}>{f.text}</li>
          ))}
        </ul>
      )}

      {promotion && promotion.conflictsSkipped.length > 0 && (
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, color: '#b26b00' }}>
          {promotion.conflictsSkipped.map((c, i) => (
            <li key={i}>
              Skipped {c.section} at {c.module1Correct}+{c.module2Correct}: existing curve says{' '}
              {c.existingScaled}, this said {c.submittedScaled}. The existing row is untouched
              and still flagged.
            </li>
          ))}
        </ul>
      )}

      {row.reviewNote && (
        <p className={s.muted} style={{ marginTop: 8 }}>Note: {row.reviewNote}</p>
      )}

      {row.isOwnSubmission ? (
        <p className={s.warnInline} style={{ marginTop: 12 }}>
          This is your own submission — someone else has to review it.
        </p>
      ) : (
        <>
          {row.status === 'pending' && (
            <div style={{ marginTop: 12 }}>
              <label className={s.label}>
                <span className={s.labelText}>Note (optional; the contributor sees it)</span>
                <input
                  className={s.input}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What you checked, or what was wrong"
                />
              </label>
            </div>
          )}

          <div className={s.actions} style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {row.status === 'pending' && (
              <>
                <Button size="sm" onClick={() => review('verified')} disabled={pending}>
                  Verify
                </Button>
                <Button size="sm" variant="remove" onClick={() => review('rejected')} disabled={pending}>
                  Reject
                </Button>
              </>
            )}
            {row.status === 'verified' && (
              <Button size="sm" onClick={promote} disabled={pending}>
                {pending ? 'Promoting…' : 'Promote into the curves'}
              </Button>
            )}
            {row.hasArtifact && (
              <Button size="sm" variant="secondary" onClick={openArtifact} disabled={pending}>
                Download the report
              </Button>
            )}
            {!row.hasArtifact && row.linkedAttempt && (
              <span className={s.muted}>Backed by an in-app attempt, no file attached.</span>
            )}
          </div>
        </>
      )}

      {message && <p className={s.ok} style={{ marginTop: 8 }}>{message}</p>}
      {error && <p role="alert" className={s.err} style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
