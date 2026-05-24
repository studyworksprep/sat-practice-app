// Client island for the Account page. Renders three sections —
// profile, teachers, subscription — from snapshot data passed in
// by the Server Component. Forms call Server Actions via
// useActionState; success messages clear after a few seconds so
// the page stays calm. No fetch, no useEffect.

'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { Card } from '@/lib/ui/Card';
import { ManagePortalButton } from './billing/ManagePortalButton';
import s from './Account.module.css';

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AccountClient({
  user,
  profile,
  access,
  subscription,
  teachers,
  updateProfileAction,
  updateEmailAction,
  addTeacherCodeAction,
}) {
  return (
    <main className={s.page}>
      <div className={s.header}>
        <h1 className={s.h1}>Account</h1>
        <Button href="/dashboard" variant="secondary" size="sm">Dashboard</Button>
      </div>

      <ProfileSection
        profile={profile}
        user={user}
        updateProfileAction={updateProfileAction}
        updateEmailAction={updateEmailAction}
      />

      <TeachersSection
        teachers={teachers}
        userRole={profile.role}
        addTeacherCodeAction={addTeacherCodeAction}
      />

      <SubscriptionSection
        access={access}
        subscription={subscription}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────

function ProfileSection({ profile, user, updateProfileAction, updateEmailAction }) {
  const [profileState, submitProfile, profilePending] = useActionState(
    updateProfileAction,
    null,
  );
  const [emailState, submitEmail, emailPending] = useActionState(
    updateEmailAction,
    null,
  );

  return (
    <Card className={s.card}>
      <SectionHeader title="Profile" subtitle="Your name and study targets." />

      <form action={submitProfile} className={s.form}>
        <div className={s.grid2}>
          <Field label="First name" name="first_name" defaultValue={profile.first_name ?? ''} />
          <Field label="Last name" name="last_name" defaultValue={profile.last_name ?? ''} />
        </div>

        <Field
          label="High school"
          name="high_school"
          defaultValue={profile.high_school ?? ''}
        />

        <div className={s.grid2}>
          <Field
            label="Graduation year"
            name="graduation_year"
            type="number"
            inputMode="numeric"
            min={2000}
            max={2100}
            defaultValue={profile.graduation_year ?? ''}
          />
          <Field
            label="Target SAT score"
            name="target_sat_score"
            type="number"
            inputMode="numeric"
            min={400}
            max={1600}
            step={10}
            defaultValue={profile.target_sat_score ?? ''}
          />
        </div>

        <Field
          label="SAT test date"
          name="sat_test_date"
          type="date"
          defaultValue={profile.sat_test_date ?? ''}
          help="Your personal target test date. Tutor-added registrations override this on the dashboard."
        />

        <div className={s.formActions}>
          <Button type="submit" variant="primary" size="sm" disabled={profilePending}>
            {profilePending ? 'Saving…' : 'Save profile'}
          </Button>
          <FormStatus state={profileState} successText="Saved." />
        </div>
      </form>

      <div className={s.divider} />

      <form action={submitEmail} className={s.form}>
        <div className={s.eyebrow}>Email address</div>
        <Field
          label={null}
          name="email"
          type="email"
          defaultValue={user.email ?? ''}
          help="Changing your email sends a confirmation link to the new address. The change does not take effect until you click it."
        />
        <div className={s.formActions}>
          <Button type="submit" variant="secondary" size="sm" disabled={emailPending}>
            {emailPending ? 'Sending…' : 'Update email'}
          </Button>
          <FormStatus
            state={emailState}
            successText={
              emailState?.ok && emailState.data?.pending
                ? `Confirmation sent to ${emailState.data.pending}. Click the link in that email to finish the change.`
                : 'Confirmation sent.'
            }
          />
        </div>
      </form>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Teachers
// ─────────────────────────────────────────────────────────────

function TeachersSection({ teachers, userRole, addTeacherCodeAction }) {
  const canAddCode = userRole === 'student' || userRole === 'practice';
  const [state, submit, pending] = useActionState(addTeacherCodeAction, null);
  const [code, setCode] = useState('');

  return (
    <Card className={s.card}>
      <SectionHeader
        title="Your teachers"
        subtitle={
          canAddCode
            ? 'Add a teacher code to link your account so your teacher can give you assignments and track your progress.'
            : 'Teachers and managers manage their rosters from the tutor tools.'
        }
      />

      {teachers.length === 0 ? (
        <div className={s.empty}>You haven&apos;t linked a teacher yet.</div>
      ) : (
        <ul className={s.teacherList}>
          {teachers.map((t) => (
            <li key={t.id} className={s.teacherRow}>
              <div className={s.teacherIdent}>
                <span className={s.teacherName}>
                  {[t.first_name, t.last_name].filter(Boolean).join(' ') || t.email || 'Teacher'}
                </span>
                {t.email && (
                  <span className={s.teacherEmail}>{t.email}</span>
                )}
              </div>
              {t.subscription_exempt && (
                <span className={`${s.pill} ${s.pillExempt}`}>Studyworks</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAddCode && (
        <form action={submit} className={s.form}>
          <div className={s.eyebrow}>Add a teacher code</div>
          <div className={s.codeRow}>
            <input
              type="text"
              name="code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="e.g. K7P3RX"
              className={`${s.input} ${s.codeInput}`}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <Button type="submit" variant="primary" size="sm" disabled={pending || !code.trim()}>
              {pending ? 'Linking…' : 'Link teacher'}
            </Button>
          </div>
          <FormStatus
            state={state}
            successText={
              state?.ok && state.data?.grantedExemption
                ? 'Linked. Your account now has Studyworks access at no cost — no subscription required.'
                : state?.ok
                  ? 'Linked. Your teacher can now assign you work.'
                  : 'Linked.'
            }
          />
        </form>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Subscription
// ─────────────────────────────────────────────────────────────

function SubscriptionSection({ access, subscription }) {
  return (
    <Card className={s.card}>
      <SectionHeader title="Subscription" subtitle="Your access status and billing." />

      <div className={s.statusRow}>
        {access.hasAccess ? (
          <>
            <span className={`${s.dot} ${s.dotActive}`} aria-hidden="true" />
            <span className={s.statusLabel}>Active</span>
            {access.reason === 'exempt' && (
              <span className={`${s.pill} ${s.pillExempt}`}>Exempt</span>
            )}
            {access.reason === 'role' && (
              <span className={`${s.pill} ${s.pillRole}`}>{access.plan || 'Staff'}</span>
            )}
            {access.reason === 'subscription' && (
              <span className={`${s.pill} ${s.pillSub}`}>
                {subscription?.plan ?? 'Subscribed'}
              </span>
            )}
          </>
        ) : (
          <>
            <span className={`${s.dot} ${s.dotInactive}`} aria-hidden="true" />
            <span className={s.statusLabel}>No active subscription</span>
          </>
        )}
      </div>

      {subscription && (
        <div className={s.subDetails}>
          <Row label="Plan" value={subscription.plan} capitalize />
          <Row
            label="Status"
            value={subscription.status === 'trialing' ? 'Free Trial' : subscription.status}
            tone={
              subscription.status === 'active' ? 'good'
              : subscription.status === 'trialing' ? 'accent'
              : 'warn'
            }
            capitalize
          />
          {subscription.trial_end && subscription.status === 'trialing' && (
            <Row label="Trial ends" value={formatDate(subscription.trial_end)} />
          )}
          {subscription.current_period_end && (
            <Row
              label={subscription.cancel_at_period_end ? 'Access until' : 'Next billing date'}
              value={formatDate(subscription.current_period_end)}
            />
          )}
          {subscription.cancel_at_period_end && (
            <div className={s.cancelNote}>
              Your subscription will cancel at the end of the current period.
            </div>
          )}
        </div>
      )}

      {access.reason === 'exempt' && (
        <div className={s.exemptNote}>
          Your account has full Studyworks access at no cost. No subscription or
          payment is required.
        </div>
      )}

      <div className={s.formActions}>
        {subscription && <ManagePortalButton />}
        {!access.hasAccess && (
          <Button href="/subscribe" variant="primary" size="sm">
            Choose a plan
          </Button>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Small primitives
// ─────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }) {
  return (
    <div className={s.sectionHead}>
      <h2 className={s.h2}>{title}</h2>
      {subtitle && <p className={s.sectionSub}>{subtitle}</p>}
    </div>
  );
}

function Field({ label, name, help, ...inputProps }) {
  return (
    <label className={s.field}>
      {label && <span className={s.label}>{label}</span>}
      <input name={name} className={s.input} {...inputProps} />
      {help && <span className={s.help}>{help}</span>}
    </label>
  );
}

function FormStatus({ state, successText }) {
  if (!state) return null;
  if (state.ok) {
    return <span className={s.successMsg}>{successText}</span>;
  }
  return <span className={s.errorMsg}>{state.error}</span>;
}

function Row({ label, value, tone, capitalize }) {
  const valueCls = [
    s.rowValue,
    tone === 'good' ? s.toneGood : '',
    tone === 'accent' ? s.toneAccent : '',
    tone === 'warn' ? s.toneWarn : '',
    capitalize ? s.capitalize : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>{label}</span>
      <span className={valueCls}>{value}</span>
    </div>
  );
}
