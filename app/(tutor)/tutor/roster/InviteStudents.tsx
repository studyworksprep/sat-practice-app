'use client';

// Tutor → Roster → "Invite students". Email a student a single-use
// invitation code; pending codes are listed with Copy and Revoke.
// Invited students always subscribe — Studyworks sponsorship is an
// admin decision (see invite-actions.ts).

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { formatDate } from '@/lib/formatters';
import {
  inviteStudentToRoster,
  revokeRosterInvitation,
  type InviteStudentData,
} from './invite-actions';
import s from './InviteStudents.module.css';

export interface PendingInvitation {
  id: string;
  code: string;
  email: string;
  createdAt: string;
}

type InviteState =
  | { ok: true; data: InviteStudentData }
  | { ok: false; error: string }
  | null;

type RevokeState = { ok: true; data: { id: string } } | { ok: false; error: string } | null;

export function InviteStudents({
  pending,
  isStudyworksTutor,
  defaultOpen,
}: {
  pending: PendingInvitation[];
  isStudyworksTutor: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, formAction, submitting] = useActionState<InviteState, FormData>(
    inviteStudentToRoster as (prev: InviteState, fd: FormData) => Promise<InviteState>,
    null,
  );

  return (
    <section className={s.card} id="invite" aria-labelledby="invite-title">
      <div className={s.head}>
        <div>
          <h2 id="invite-title" className={s.title}>Invite students</h2>
          {pending.length > 0 && !open && (
            <span className={s.meta}>
              {pending.length} invitation{pending.length === 1 ? '' : 's'} waiting
            </span>
          )}
        </div>
        <Button
          type="button"
          variant={open ? 'secondary' : 'primary'}
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="invite-body"
        >
          {open ? 'Hide' : 'Invite a student'}
        </Button>
      </div>

      {open && (
        <div id="invite-body" className={s.body}>
          <p className={s.note}>
            We’ll email the student a one-time code. When they sign up with it, or enter it
            under Account if they already have an account, they join your roster and you can
            assign work and follow their progress. Invited students subscribe to Studyworks
            themselves, starting with a 7-day free trial.
            {isStudyworksTutor &&
              ' Students sponsored by Studyworks Prep are added by a Studyworks admin.'}
          </p>

          <form action={formAction} className={s.form}>
            <label className={s.field}>
              <span className={s.label}>Student email</span>
              <input
                className={s.input}
                name="email"
                type="email"
                required
                autoComplete="off"
                placeholder="student@example.com"
              />
            </label>
            <Button type="submit" variant="primary" size="sm" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send invitation'}
            </Button>
          </form>

          <InviteStatus state={state} />

          {pending.length > 0 && (
            <>
              <h3 className={s.listTitle}>Waiting to join ({pending.length})</h3>
              <ul className={s.list}>
                {pending.map((inv) => (
                  <PendingRow key={inv.id} invitation={inv} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function InviteStatus({ state }: { state: InviteState }) {
  if (!state) return null;
  if (!state.ok) {
    return <p className={`${s.status} ${s.err}`} role="alert">{state.error}</p>;
  }
  const { code, email, emailSent, reused } = state.data;
  if (emailSent) {
    return (
      <p className={`${s.status} ${s.ok}`} role="status">
        {reused ? 'Invitation re-sent to ' : 'Invitation sent to '}
        <strong>{email}</strong>, code <code className={s.code}>{code}</code>.
      </p>
    );
  }
  return (
    <p className={`${s.status} ${s.warn}`} role="status">
      {reused ? 'There’s already an invitation for ' : 'Invitation created for '}
      <strong>{email}</strong>, but the email couldn’t be sent. Share the code{' '}
      <code className={s.code}>{code}</code> with the student yourself.
    </p>
  );
}

function PendingRow({ invitation }: { invitation: PendingInvitation }) {
  const [state, revokeAction, revoking] = useActionState<RevokeState, FormData>(
    revokeRosterInvitation as (prev: RevokeState, fd: FormData) => Promise<RevokeState>,
    null,
  );
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(invitation.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <li className={s.row}>
      <span className={s.rowEmail}>{invitation.email}</span>
      <code className={s.code}>{invitation.code}</code>
      <span className={s.rowDate}>Sent {formatDate(invitation.createdAt)}</span>
      <span className={s.rowActions}>
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy code'}
        </Button>
        <form action={revokeAction}>
          <input type="hidden" name="id" value={invitation.id} />
          <Button type="submit" variant="remove" size="sm" disabled={revoking}>
            {revoking ? 'Revoking…' : 'Revoke'}
          </Button>
        </form>
      </span>
      {state && !state.ok && <p className={s.rowError} role="alert">{state.error}</p>}
    </li>
  );
}
