import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { maybeSendWelcomeEmail } from '../../../lib/email/maybeSendWelcomeEmail';

// GET /auth/callback
// Handles the PKCE token exchange for password-recovery and any
// future custom email templates that point here. The default
// Supabase signup-confirmation flow does NOT route through this
// endpoint — it goes through /auth/v1/verify and redirects to the
// site URL — so the welcome-email send actually fires from the
// home page server component. The call here is defense in depth
// in case the email template is later customized to use PKCE.
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
  }

  // If no code or exchange failed, redirect to home with error
  return NextResponse.redirect(`${origin}/?confirmed=error`);
}
