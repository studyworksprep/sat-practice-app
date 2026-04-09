import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /auth/callback
// Handles the token exchange after email confirmation / OAuth redirects.
// Supabase sends users here with a ?code= param after confirming their email.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // If a specific next URL was requested (e.g. password reset), go there
      if (next) return NextResponse.redirect(`${origin}${next}`);
      // Otherwise this is an email confirmation — show success message
      return NextResponse.redirect(`${origin}/?confirmed=true`);
    }
  }

  // If no code or exchange failed, redirect to home with error
  return NextResponse.redirect(`${origin}/?confirmed=error`);
}
