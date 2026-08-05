// Contributor track record, and the rule that decides when a submission
// can skip the review queue.
//
// The thing being traded here is reviewer attention, not correctness.
// Auto-verification does NOT write score_conversion — promotion is still
// a deliberate manager/admin action on every submission. What it skips
// is a human opening a parsed report to confirm what the parser already
// read out of it, for a contributor who has been right repeatedly.
//
// The rule is deliberately mean. Getting it wrong in the strict
// direction costs a reviewer thirty seconds; getting it wrong in the
// loose direction puts a bad curve in front of students. So: evidence
// required, a real track record required, and any severe flag or any
// past rejection drops the contributor straight back to manual review.

/** Promoted submissions a contributor needs before the rule applies.
 *  Three is "this wasn't luck" without being unreachable — a tutor
 *  running practice tests clears it in a month. */
export const AUTO_VERIFY_MIN_PROMOTED = 3;

/** Flags that must always reach a person. A conversion conflict means
 *  two official reports disagree about the same scaled score; deciding
 *  that by rule is exactly the judgement call a reviewer exists for. */
const SEVERE_FLAGS = new Set(['conversion_conflict', 'route_inconsistent']);

export interface ContributorRecord {
  total: number;
  pending: number;
  verified: number;
  promoted: number;
  rejected: number;
}

export const EMPTY_RECORD: ContributorRecord = {
  total: 0, pending: 0, verified: 0, promoted: 0, rejected: 0,
};

/** Tally a contributor's submissions by status. Takes rows rather than
 *  querying so the admin queue can count many contributors from one
 *  read and the auto-verify path can count one from another. */
export function tallyRecord(rows: Array<{ status: string }>): ContributorRecord {
  const record: ContributorRecord = { ...EMPTY_RECORD };
  for (const row of rows) {
    record.total += 1;
    if (row.status === 'pending') record.pending += 1;
    else if (row.status === 'verified') record.verified += 1;
    else if (row.status === 'promoted') record.promoted += 1;
    else if (row.status === 'rejected') record.rejected += 1;
  }
  return record;
}

/** Share of a contributor's reviewed submissions that were promoted.
 *  Null while nothing has been reviewed — "0%" would read as a bad
 *  record when it actually means "no record yet". */
export function acceptanceRate(record: ContributorRecord): number | null {
  const decided = record.promoted + record.rejected;
  if (decided === 0) return null;
  return Math.round((record.promoted / decided) * 100);
}

export interface AutoVerifyInput {
  hasArtifact: boolean;
  validationFlags: unknown[];
  record: ContributorRecord;
}

export interface AutoVerifyVerdict {
  autoVerify: boolean;
  /** Why not, in the contributor's language. Null when it passed. */
  reason: string | null;
}

/**
 * Should this submission skip the review queue?
 *
 * Every condition has to hold. In order of how much each one is doing:
 *
 *   1. A stored report. Without the artifact there is nothing for the
 *      rule to be confident ABOUT — a hand-entered grid is one person's
 *      word, however good their record.
 *   2. No severe flags. A conflict or a routing inconsistency is the
 *      case a reviewer is for.
 *   3. Never rejected. One bad submission returns the contributor to
 *      manual review permanently, until a reviewer chooses otherwise.
 *      Cheap to apply, and it makes the rule's failure mode "more
 *      review" rather than "more bad data".
 *   4. At least AUTO_VERIFY_MIN_PROMOTED promoted submissions.
 */
export function evaluateAutoVerify(input: AutoVerifyInput): AutoVerifyVerdict {
  if (!input.hasArtifact) {
    return { autoVerify: false, reason: 'no stored report to stand behind it' };
  }

  const severe = input.validationFlags.some((flag) =>
    SEVERE_FLAGS.has(String((flag as { code?: unknown })?.code ?? '')),
  );
  if (severe) {
    return { autoVerify: false, reason: 'the submission raised a flag that needs a person' };
  }

  if (input.record.rejected > 0) {
    return { autoVerify: false, reason: 'this contributor has had a submission rejected before' };
  }

  if (input.record.promoted < AUTO_VERIFY_MIN_PROMOTED) {
    return {
      autoVerify: false,
      reason: `contributor has ${input.record.promoted} promoted submission${
        input.record.promoted === 1 ? '' : 's'
      }, ${AUTO_VERIFY_MIN_PROMOTED} needed`,
    };
  }

  return { autoVerify: true, reason: null };
}
