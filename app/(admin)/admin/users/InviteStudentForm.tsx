// Admin → Users: "Invite student" (owner policy 2026-07-16).
// Email + tutor → generates a single-use, email-bound invitation code,
// sends the welcome invitation, and reports the code inline (with a
// loud fallback when the email couldn't be sent, so the admin can pass
// the code along manually). Tracking lives on the Codes tab.

'use client';

import { useActionState } from 'react';
import { Button } from '@/lib/ui/Button';
import { inviteStudent } from './codes/actions';
import f from '../../forms.module.css';

interface TutorOption {
  id: string;
  label: string;
}

interface InviteResult {
  ok: boolean;
  error?: string;
  // actionOk() nests the payload under `data`.
  data?: { code: string; email: string; emailSent: boolean } | null;
}

export function InviteStudentForm({ tutors }: { tutors: TutorOption[] }) {
  const [state, formAction, pending] = useActionState<InviteResult | null, FormData>(
    inviteStudent as (prev: InviteResult | null, fd: FormData) => Promise<InviteResult>,
    null,
  );

  return (
    <div>
      <form action={formAction} className={f.row}>
        <label className={f.label}>
          <span className={f.labelText}>Student email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="student@example.com"
            className={f.input}
            style={{ minWidth: 240 }}
          />
        </label>
        <label className={f.label}>
          <span className={f.labelText}>Tutor</span>
          <select name="teacher_id" required className={f.input} defaultValue="">
            <option value="" disabled>Pick a tutor…</option>
            {tutors.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Inviting…' : 'Invite student'}
        </Button>
      </form>

      {state && !state.ok && (
        <p style={S.error} role="alert">{state.error}</p>
      )}
      {state?.ok && state.data && (
        <p style={state.data.emailSent ? S.ok : S.warn}>
          {state.data.emailSent ? (
            <>Invitation emailed to <strong>{state.data.email}</strong> — code <code style={S.code}>{state.data.code}</code>. Track it on the Codes tab.</>
          ) : (
            <>Invitation created for <strong>{state.data.email}</strong>, but the email could not be sent — pass the code <code style={S.code}>{state.data.code}</code> along manually.</>
          )}
        </p>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  error: { color: '#991b1b', fontSize: 13, marginTop: 8 },
  ok: { color: '#166534', fontSize: 13, marginTop: 8 },
  warn: { color: '#92400e', fontSize: 13, marginTop: 8 },
  code: {
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    letterSpacing: '0.08em',
    background: 'var(--color-slate-100)',
    padding: '1px 6px',
    borderRadius: 4,
  },
};
