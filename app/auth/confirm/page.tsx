// Password-reset confirmation interstitial — the destination of the
// link in the recovery email (supabase/templates/recovery.html).
//
// Why an interstitial instead of verifying on page load: the reset
// token is single-use, and corporate/school mail filters (Outlook
// SafeLinks and friends) prefetch links in inbound email. If a GET
// consumed the token, the scanner would burn it before the user ever
// clicked — which is how the previous PKCE flow died in practice.
// This page renders a button; the token is only exchanged when the
// form POSTs to /auth/confirm/verify. Bots GET, humans click.
//
// The token_hash itself is opaque and single-use, but keep it out of
// outbound referrers anyway (metadata.referrer below).

import s from './Confirm.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Reset your password — Studyworks',
  referrer: 'no-referrer' as const,
  robots: { index: false, follow: false },
};

type SearchParams = { [key: string]: string | string[] | undefined };

function firstString(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === 'string' ? v : null;
}

export default async function ConfirmPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const tokenHash = firstString(searchParams.token_hash);
  const type = firstString(searchParams.type);
  const rawNext = firstString(searchParams.next);

  // Same-origin paths only, so the redirect after verification can't
  // be pointed off-site by a crafted link.
  const next =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/auth/update-password';

  // Only the recovery flow routes through here today. Signup
  // confirmation still uses Supabase's default verify redirect; if
  // another email flow ever moves to token_hash links, extend this
  // (and the allowlist in verify/route.ts) deliberately.
  if (!tokenHash || type !== 'recovery') {
    return (
      <main className={s.page}>
        <div className={s.card}>
          <h1 className={s.h1}>This link isn&apos;t valid</h1>
          <p className={s.body}>
            This password reset link is incomplete or malformed. Please
            request a new one from the login page.
          </p>
          <a className={s.submit} href="/login">
            Back to log in
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <div className={s.card}>
        <h1 className={s.h1}>Reset your password</h1>
        <p className={s.body}>
          You&apos;re one step away from setting a new password for your
          Studyworks account. Click the button below to continue.
        </p>
        <form method="POST" action="/auth/confirm/verify" className={s.form}>
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={next} />
          <button className={s.submit} type="submit">
            Continue to reset password
          </button>
        </form>
        <p className={s.muted}>
          Didn&apos;t request a password reset? You can safely close this
          page — nothing changes until you continue.
        </p>
      </div>
    </main>
  );
}
