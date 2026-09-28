'use client';

// "Login" section of the admin user page (client half): where the
// student stands with their login, a one-click "Send login setup email",
// and a way to change the address they sign in with. Two forms wired to
// Server Actions via useActionState, like the Testing section.

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { Card } from '@/lib/ui/Card';
import { formatDate } from '@/lib/formatters';
import { sendLoginSetupEmail, setLoginEmail } from './login-actions';
import s from '../../../forms.module.css';

export interface LoginState {
  loginEmail: string | null;
  /** The placeholder address Lessonworks provisioning stamps when the
   *  student record had no email; nothing sent there is read. */
  placeholder: boolean;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  /** When a password link was last issued, by this button or by the
   *  student's own "Forgot password?". */
  recoverySentAt: string | null;
}

interface LoginSetupCardProps {
  userId: string;
  profileEmail: string | null;
  state: LoginState | null;
  loadError: string | null;
  welcomeSentAt: string | null;
  fromLessonworks: boolean;
}

type SendState = { ok: true; data: { sentTo: string; sentAt: string } } | { ok: false; error: string } | null;
type EmailState = { ok: true; data: { email: string } } | { ok: false; error: string } | null;
type FormAction<S> = (prev: S, fd: FormData) => Promise<S>;

export function LoginSetupCard({
  userId,
  profileEmail,
  state,
  loadError,
  welcomeSentAt,
  fromLessonworks,
}: LoginSetupCardProps) {
  const [sendState, sendAction, sendPending] = useActionState<SendState, FormData>(
    sendLoginSetupEmail as unknown as FormAction<SendState>,
    null,
  );
  const [emailState, emailAction, emailPending] = useActionState<EmailState, FormData>(
    setLoginEmail as unknown as FormAction<EmailState>,
    null,
  );
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  const loginEmail = state?.loginEmail ?? profileEmail;
  const placeholder = state?.placeholder ?? false;
  const canSend = Boolean(loginEmail) && !placeholder;

  return (
    <div className={s.form}>
      <dl style={S.facts}>
        <div style={S.fact}>
          <dt style={S.dt}>Login email</dt>
          <dd style={S.dd}>
            <code>{loginEmail ?? '—'}</code>
            {state && !placeholder && (
              <span className={s.muted}>
                {' '}· {state.emailConfirmedAt ? 'confirmed' : 'not confirmed'}
              </span>
            )}
          </dd>
        </div>
        <div style={S.fact}>
          <dt style={S.dt}>Signed in</dt>
          <dd style={S.dd}>
            {state
              ? state.lastSignInAt
                ? `Last ${formatDate(state.lastSignInAt)}`
                : 'Never'
              : '—'}
          </dd>
        </div>
        <div style={S.fact}>
          <dt style={S.dt}>Password link</dt>
          <dd style={S.dd}>
            {state
              ? state.recoverySentAt
                ? `Sent ${formatDate(state.recoverySentAt)}`
                : 'None sent yet'
              : '—'}
          </dd>
        </div>
        <div style={S.fact}>
          <dt style={S.dt}>Welcome email</dt>
          <dd style={S.dd}>
            {welcomeSentAt ? `Sent ${formatDate(welcomeSentAt)}` : 'Not yet (goes out on first sign-in)'}
          </dd>
        </div>
      </dl>

      {loadError && (
        <p className={s.err} role="alert">
          Login details are unavailable: {loadError}
        </p>
      )}

      {placeholder && (
        <Card tone="warn">
          <p style={{ margin: 0, fontSize: 13 }}>
            <strong>No email can reach this student.</strong> Lessonworks had no student
            email when it created this account, so the login carries a placeholder address.
            Set the student&rsquo;s real email below, then send the setup email.
          </p>
        </Card>
      )}

      <form action={sendAction} className={s.row}>
        <input type="hidden" name="user_id" value={userId} />
        <Button type="submit" variant="primary" size="sm" disabled={sendPending || !canSend}>
          {sendPending ? 'Sending…' : 'Send login setup email'}
        </Button>
        <span className={s.muted}>
          {fromLessonworks
            ? 'Lessonworks created this account with no email to the student. '
            : ''}
          Emails a set-your-password link, which expires within about an hour. Safe to resend.
        </span>
      </form>
      {sendState?.ok && (
        <p className={s.ok} role="status">
          Sent to {sendState.data.sentTo}. If the link expires before they open it, they can use
          &ldquo;Forgot password?&rdquo; on the login page with that address, or you can send again.
        </p>
      )}
      {sendState?.ok === false && !sendPending && (
        <p className={s.err} role="alert">{sendState.error}</p>
      )}

      <div>
        {emailState?.ok && (
          <p className={s.ok} role="status">
            Login email changed to {emailState.data.email}. Send the setup email so they can sign in
            with it.
          </p>
        )}
        {!showEmailForm ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowEmailForm(true)}>
            Change login email…
          </Button>
        ) : (
          <form action={emailAction} className={s.form}>
            <input type="hidden" name="user_id" value={userId} />
            <p style={{ margin: 0, fontSize: 13 }}>
              Changes the address the student signs in with and marks it confirmed. The profile
              email follows. Password links and the welcome email go to the new address.
            </p>
            <label className={s.label}>
              <span className={s.labelText}>New login email</span>
              <input
                name="email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className={s.input}
                autoComplete="off"
                required
              />
            </label>
            <div className={s.row}>
              <Button type="submit" variant="primary" size="sm" disabled={emailPending || !newEmail.trim()}>
                {emailPending ? 'Saving…' : 'Save login email'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => { setShowEmailForm(false); setNewEmail(''); }}
              >
                Cancel
              </Button>
              {emailState?.ok === false && !emailPending && (
                <span className={s.err}>{emailState.error}</span>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const S = {
  facts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    margin: 0,
  },
  fact: { margin: 0 },
  dt: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--fg3)',
    marginBottom: 2,
  },
  dd: { margin: 0, fontSize: 13, color: 'var(--fg1)' },
};
