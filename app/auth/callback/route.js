import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /auth/callback
// Handles the token exchange after email confirmation / OAuth redirects.
// Supabase sends users here with a ?code= param after confirming their email.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/dashboard';

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If no code or exchange failed, redirect to login
  return NextResponse.redirect(`${origin}/login`);
}
