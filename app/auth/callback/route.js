import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /auth/callback
// Handles the token exchange after email confirmation / OAuth /
// magic-link redirects.
//
// Inbound shapes:
//   1. ?code=<pkce-code>   — server-side exchange via
//                            exchangeCodeForSession(). Used by email
//                            confirmation, password reset, and the
//                            demo auto-login flow.
//   2. ?next=/foo          — forwarded to after the exchange. Used
//                            by password-reset flows.
//   3. sw_demo_next cookie — destination for the demo auto-login.
//                            Set by /auth/demo/[persona] before it
//                            sends the user through Supabase /verify.
//                            We can't use ?next= for the demo flow
//                            because Supabase rejects redirect_to
//                            URLs with query strings against its
//                            allowlist; the cookie is the workaround.
//                            Consumed and cleared here.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');
  const demoNext = request.cookies.get('sw_demo_next')?.value;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Demo auto-login carries its destination in a one-shot
      // cookie. Honour it first; then any explicit ?next=; then
      // fall back to the email-confirmed landing page.
      if (demoNext && demoNext.startsWith('/') && !demoNext.startsWith('//')) {
        const res = NextResponse.redirect(`${origin}${demoNext}`);
        res.cookies.delete('sw_demo_next');
        return res;
      }
      if (next) return NextResponse.redirect(`${origin}${next}`);
      // Otherwise this is an email confirmation — show success message
      return NextResponse.redirect(`${origin}/?confirmed=true`);
    }
  }

  // If no code or exchange failed, redirect to home with error
  return NextResponse.redirect(`${origin}/?confirmed=error`);
}
