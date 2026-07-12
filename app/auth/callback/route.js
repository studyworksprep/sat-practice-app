import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { maybeSendWelcomeEmail } from '../../../lib/email/maybeSendWelcomeEmail';
import { logger } from '../../../lib/api/logger';

// GET /auth/callback
// Handles the PKCE token exchange for any email flow still pointed
// here. The default Supabase signup-confirmation flow does NOT route
// through this endpoint — it goes through /auth/v1/verify and
// redirects to the site URL — so the welcome-email send actually
// fires from the home page server component. The call here is
// defense in depth in case the email template is later customized
// to use PKCE.
//
// Password recovery no longer routes through here: the recovery
// email links to /auth/confirm (token_hash + verifyOtp), which has
// no PKCE same-browser dependency. The `next` handling below stays
// for reset emails that were already in flight when the template
// changed, and for any future flow that opts into PKCE deliberately.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (next) return NextResponse.redirect(`${origin}${next}`);

      const userId = data?.user?.id;
      const email = data?.user?.email;
      if (userId && email) {
        await maybeSendWelcomeEmail({ userId, email, origin });
      }

      return NextResponse.redirect(`${origin}/?confirmed=true`);
    }
    // PKCE exchange failures were silent for months and hid a broken
    // reset flow (July 2026). Log every one.
    logger.warn(
      {
        event: 'auth_code_exchange_failed',
        error: error.message,
        status: error.status ?? null,
        next: next ?? null,
      },
      'auth_code_exchange_failed',
    );
  }

  // Old in-flight password-reset links land here on failure; send
  // them to the reset page's "link expired" state instead of the
  // signup-confirmation error banner on the home page.
  if (next && next.startsWith('/auth/update-password')) {
    return NextResponse.redirect(`${origin}/auth/update-password?error=invalid_link`);
  }

  // If no code or exchange failed, redirect to home with error
  return NextResponse.redirect(`${origin}/?confirmed=error`);
}
