import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/api/logger';
import { rateLimit } from '@/lib/api/rateLimit';
import {
  LOGIN_SETUP_METADATA_KEY,
  loginSetupSecret,
  readLoginSetupToken,
  type LoginSetupMetadata,
} from '@/lib/email/loginSetup';

// POST /auth/setup/verify
//
// Spends the signed setup token from the /auth/setup interstitial (the
// admin-sent "Set your Studyworks password" email). On a valid token
// it mints a Supabase recovery token for the account with
// auth.admin.generateLink and verifies it in the same request via
// verifyOtp({ token_hash }), which writes the session cookies onto this
// response — the pattern /auth/demo uses — and lands the student on
// /auth/update-password with a session, exactly where "Forgot
// password?" ends. The Supabase token therefore lives for seconds; the
// 48-hour lifetime belongs to our token (lib/email/loginSetup.ts).
//
// The token is good for one account, one login email, and one nonce.
// The nonce is stored in app_metadata.login_setup when the admin sends
// the email and cleared here on success, so a link works once, a
// resend retires earlier links, and a changed login email retires them
// too. The service client here only reads the auth user and clears
// that nonce; it is a public, unauthenticated route, like
// /auth/confirm/verify.
//
// POST-only on purpose: mail-filter link scanners GET everything in an
// email. Like /auth/confirm/verify this is a navigation flow — every
// failure redirects to a page with a human-readable state, never JSON.

const DESTINATION = '/auth/update-password';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const expired = `${origin}${DESTINATION}?error=invalid_link`;
  const fail = (reason: string, extra: Record<string, unknown> = {}) => {
    logger.warn({ event: 'login_setup_verify_failed', reason, ...extra }, 'login_setup_verify_failed');
    return NextResponse.redirect(expired, 303);
  };

  // Signature checks are cheap, but a forged token still costs a
  // request; keep brute force off the table per client.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const rl = await rateLimit(`login-setup-verify:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) return fail('rate_limited');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('bad_form');
  }

  const token = readLoginSetupToken(form.get('token'), loginSetupSecret());
  if (!token || !isUuid(token.u)) return fail('bad_token');

  const service = createServiceClient();
  const { data: userData, error: userErr } = await service.auth.admin.getUserById(token.u);
  const user = userData?.user;
  if (userErr || !user) return fail('no_user', { user_id: token.u });

  const currentEmail = user.email?.trim().toLowerCase() ?? null;
  if (!currentEmail || currentEmail !== token.e) return fail('email_changed', { user_id: user.id });

  const meta = (user.app_metadata?.[LOGIN_SETUP_METADATA_KEY] ?? null) as LoginSetupMetadata | null;
  if (!meta?.nonce || meta.nonce !== token.n) return fail('nonce_mismatch', { user_id: user.id });

  // Mint the recovery token and spend it in the same request.
  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: 'recovery',
    email: currentEmail,
  });
  const hashedToken = link?.properties?.hashed_token;
  if (linkErr || !hashedToken) {
    return fail('generate_link_failed', { user_id: user.id, error: linkErr?.message ?? null });
  }

  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: hashedToken });
  if (verifyErr) {
    return fail('verify_failed', { user_id: user.id, error: verifyErr.message, status: verifyErr.status ?? null });
  }

  // Retire the link. Best-effort: the student already has a session,
  // and a failure here only leaves the link reusable until the next
  // send; it still cannot outlive its 48 hours.
  const spent: LoginSetupMetadata = { sent_at: meta.sent_at, nonce: null, used_at: new Date().toISOString() };
  const { error: metaErr } = await service.auth.admin.updateUserById(user.id, {
    app_metadata: { [LOGIN_SETUP_METADATA_KEY]: spent },
  });
  if (metaErr) {
    logger.warn(
      { event: 'login_setup_nonce_clear_failed', user_id: user.id, error: metaErr.message },
      'login_setup_nonce_clear_failed',
    );
  }

  logger.info({ event: 'login_setup_verified', user_id: user.id }, 'login_setup_verified');
  // 303 so the browser follows the redirect with a GET.
  return NextResponse.redirect(`${origin}${DESTINATION}`, 303);
}
