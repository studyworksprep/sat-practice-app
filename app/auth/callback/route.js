import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /auth/callback
// Handles the token exchange after email confirmation / OAuth /
// password-recovery redirects.
//
// Inbound shapes:
//   1. ?code=<pkce-code>  — server-side exchange via
//                           exchangeCodeForSession(). Used by
//                           email confirmation and password-reset
//                           flows.
//   2. ?next=/foo         — forwarded to after the exchange. Used
//                           by password-reset flows to land the
//                           user on /auth/update-password.
//
// The demo auto-login at /auth/demo/[persona] exchanges its
// magic-link token server-side directly (verifyOtp) and does not
// route through this callback.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (next) return NextResponse.redirect(`${origin}${next}`);
      // Otherwise this is an email confirmation — show success message
      return NextResponse.redirect(`${origin}/?confirmed=true`);
    }
  }

  // If no code or exchange failed, redirect to home with error
  return NextResponse.redirect(`${origin}/?confirmed=error`);
}
