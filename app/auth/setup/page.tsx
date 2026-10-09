// Login setup interstitial — the destination of the link in the admin-
// sent "Set your Studyworks password" email (lib/email/loginSetup.ts).
//
// Same shape as /auth/confirm, for the same reason: mail filters
// prefetch every link in an email, so a GET must not spend anything.
// This page renders a button; the signed setup token is only checked,
// and the Supabase session only minted, when the form POSTs to
// /auth/setup/verify. Bots GET, humans click.
//
// The token is opaque and bound to one account, but keep it out of
// outbound referrers anyway (metadata.referrer below).

import s from '../confirm/Confirm.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Set your password — Studyworks',
  referrer: 'no-referrer' as const,
  robots: { index: false, follow: false },
};

type SearchParams = { [key: string]: string | string[] | undefined };

function firstString(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === 'string' ? v : null;
}

export default async function SetupPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const token = firstString(searchParams.token);

  if (!token) {
    return (
      <main className={s.page}>
        <div className={s.card}>
          <h1 className={s.h1}>This link isn&apos;t valid</h1>
          <p className={s.body}>
            This account setup link is incomplete or malformed. Ask your tutor to send a new one,
            or use &ldquo;Forgot password?&rdquo; on the login page with your email.
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
        <h1 className={s.h1}>Set your password</h1>
        <p className={s.body}>
          Your Studyworks account is ready. Click the button below to choose a password, then you
          can sign in any time.
        </p>
        <form method="POST" action="/auth/setup/verify" className={s.form}>
          <input type="hidden" name="token" value={token} />
          <button className={s.submit} type="submit">
            Continue to set password
          </button>
        </form>
        <p className={s.muted}>
          Weren&apos;t expecting this? You can safely close this page — nothing changes until you
          continue.
        </p>
      </div>
    </main>
  );
}
