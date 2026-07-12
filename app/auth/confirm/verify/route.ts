import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/api/logger';

// POST /auth/confirm/verify
//
// Consumes the password-recovery token from the /auth/confirm
// interstitial and mints a session server-side via
// verifyOtp({ token_hash }). Unlike the old exchangeCodeForSession
// path, this has no PKCE code-verifier cookie dependency, so the
// link works no matter which browser or device opens the email.
//
// POST-only on purpose: the token is single-use, and mail-filter
// link scanners GET everything in an email. A scanner that fetches
// /auth/confirm gets an inert page; only the human-clicked form
// submission reaches this handler and spends the token.
//
// Like /auth/callback, this is a navigation flow — failures redirect
// to a page with a human-readable state, never a JSON error.

const ALLOWED_TYPES: EmailOtpType[] = ['recovery'];

function isAllowedType(t: unknown): t is EmailOtpType {
  return typeof t === 'string' && (ALLOWED_TYPES as string[]).includes(t);
}

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const expired = `${origin}/auth/update-password?error=invalid_link`;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.redirect(expired, 303);
  }

  const tokenHash = form.get('token_hash');
  const type = form.get('type');
  const rawNext = form.get('next');
  const next =
    typeof rawNext === 'string' && rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/auth/update-password';

  if (typeof tokenHash !== 'string' || !tokenHash || !isAllowedType(type)) {
    return NextResponse.redirect(expired, 303);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // The July 2026 incident stayed invisible because the old flow
    // swallowed exchange failures. Every verify failure gets a line.
    logger.warn(
      {
        event: 'password_reset_verify_failed',
        error: error.message,
        status: error.status ?? null,
        otp_type: type,
      },
      'password_reset_verify_failed',
    );
    return NextResponse.redirect(expired, 303);
  }

  // 303 so the browser follows the redirect with a GET.
  return NextResponse.redirect(`${origin}${next}`, 303);
}
