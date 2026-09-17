'use client';

// Admin "Testing" section for a student: flag the account as a test
// account, then reset it to first login as many times as needed
// (docs/dev-data-seeding.md "Resetting a test student to first login").
// Two forms wired to Server Actions via useActionState; the reset
// requires typing the account's email, mirroring the ban/delete
// confirms in StatusActions.

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { Card } from '@/lib/ui/Card';
import { setTestFlag, resetTestStudent } from './actions';
import s from '../../../forms.module.css';

// actions.js is untyped; pin the shapes this component reads.
type FlagState = { ok: true; is_test: boolean } | { ok: false; error: string } | null;
type ResetState =
  | { ok: true; deleted: Record<string, number> }
  | { ok: false; error: string }
  | null;
type FormAction<S> = (prev: S, fd: FormData) => Promise<S>;

const DELETED_LABELS: Record<string, string> = {
  practice_test_attempts_v2: 'practice-test attempts',
  act_practice_test_attempts: 'ACT test attempts',
  act_attempts: 'ACT answers',
  attempts: 'answers',
  practice_sessions: 'practice sessions',
  study_plans: 'study plans',
  student_intake: 'intake row',
  skill_mastery_snapshots: 'mastery snapshots',
  review_queue: 'review-queue items',
  lesson_progress: 'lesson progress rows',
  student_notes: 'notes',
  question_error_notes: 'error-log entries',
  question_notes: 'question notes',
  flashcard_sets: 'flashcard sets',
  desmos_saved_states: 'saved calculator states',
  sat_vocabulary_progress: 'vocabulary progress rows',
  reading_coach_turns: 'reading-coach turns',
  reading_coach_sessions: 'reading-coach sessions',
  sat_official_scores: 'official scores',
  sat_test_registrations: 'test registrations',
};

function describeDeleted(deleted: Record<string, number> | undefined) {
  const parts = Object.entries(deleted ?? {}).map(
    ([table, n]) => `${n} ${DELETED_LABELS[table] ?? table}`,
  );
  return parts.length ? parts.join(', ') : 'nothing to delete';
}

export function TestingActions({
  userId,
  email,
  isTest,
}: {
  userId: string;
  email: string | null;
  isTest: boolean;
}) {
  const [flagState, flagAction, flagPending] = useActionState<FlagState, FormData>(
    setTestFlag as unknown as FormAction<FlagState>,
    null,
  );
  const [resetState, resetAction, resetPending] = useActionState<ResetState, FormData>(
    resetTestStudent as unknown as FormAction<ResetState>,
    null,
  );
  const [showReset, setShowReset] = useState(false);
  const [confirm, setConfirm] = useState('');

  return (
    <div className={s.form}>
      <form action={flagAction} className={s.row}>
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="is_test" value={isTest ? 'false' : 'true'} />
        <Button
          type="submit"
          variant={isTest ? 'secondary' : 'primary'}
          size="sm"
          disabled={flagPending}
        >
          {flagPending ? '…' : isTest ? 'Unflag test account' : 'Flag as test account'}
        </Button>
        <span className={s.muted}>
          {isTest
            ? 'This account exists for testing and can be reset to first login below.'
            : 'Only flagged accounts can be reset. Flag real students never.'}
        </span>
        {flagState?.ok === false && <span className={s.err}>{flagState.error}</span>}
      </form>

      {isTest && (
        <div>
          {resetState?.ok && (
            <p className={s.muted} style={{ margin: '0 0 8px' }} role="status">
              Reset done — deleted {describeDeleted(resetState.deleted)}. The student now
              lands on the intake at next login.
            </p>
          )}
          {!showReset ? (
            <Button type="button" variant="remove" size="sm" onClick={() => setShowReset(true)}>
              Reset to first login…
            </Button>
          ) : (
            <Card tone="danger">
              <form action={resetAction} className={s.form}>
                <input type="hidden" name="user_id" value={userId} />
                <p style={{ margin: 0, fontSize: 13 }}>
                  <strong>Reset this test student to first login.</strong> Deletes every
                  answer, session, plan, intake answer, mastery snapshot, note, flashcard,
                  and test attempt the account has generated, and clears target score and
                  test date. Keeps the login, role, tutor and class links, assignments, and
                  subscription. Cannot be undone.
                </p>
                <label className={s.label}>
                  <span className={s.labelText}>
                    Type <code>{email}</code> to confirm
                  </span>
                  <input
                    name="confirm"
                    type="text"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={s.input}
                    style={{ fontFamily: 'var(--font-mono)' }}
                    autoComplete="off"
                  />
                </label>
                <label className={s.row} style={{ fontSize: 13 }}>
                  <input type="checkbox" name="resend_welcome" />
                  <span>Also re-send the welcome email on next login</span>
                </label>
                <p className={s.muted} style={{ margin: 0 }}>
                  The dismissed dashboard banner is stored in the browser, so use a private
                  window for a fully clean run.
                </p>
                <div className={s.row}>
                  <Button
                    type="submit"
                    variant="remove"
                    size="sm"
                    disabled={resetPending || confirm.trim().toLowerCase() !== String(email ?? '').toLowerCase()}
                  >
                    {resetPending ? 'Resetting…' : 'Reset to first login'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => { setShowReset(false); setConfirm(''); }}
                  >
                    Cancel
                  </Button>
                  {resetState?.ok === false && <span className={s.err}>{resetState.error}</span>}
                </div>
              </form>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
