import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// GET /auth/demo/student   — signs the browser in as demo.student@studyworks.demo
// GET /auth/demo/tutor     — signs the browser in as demo.tutor@studyworks.demo
//
// Drives the marketing tour. The Playwright screenshot job hits
// this route to acquire a session before navigating each
// captured page; the slideshow "View live demo →" CTAs link
// here too so a prospect lands on the real product with the
// matching seeded data.
//
// Mechanism. We use the Supabase admin API to generate a
// magic-link token for the matching demo account, then call
// verifyOtp() with that token to exchange it for a real
// session on the response cookies. The plaintext token never
// leaves the server, and the demo account's stored password
// (a random throwaway from the create-demo-accounts migration)
// is never touched.
//
// Read-only guarantee. Demo accounts carry profiles.is_demo=true,
// which the create-accounts migration mirrors into the JWT's
// app_metadata. The proxy gates every non-GET request that
// carries that flag (proxy.js), and the DB enforces it
// authoritatively via the demo_readonly_* restrictive policies.
// So even though we mint a real session here, the session can't
// do anything destructive.
//
// Rate-limiting. Generating a magic-link token is cheap but
// not free; an attacker spamming this endpoint can burn through
// our Supabase auth quota. We rate-limit at the proxy / CDN
// layer in production — see docs/runbook.md.

const PERSONAS = {
  student: { email: 'demo.student@studyworks.demo', home: '/dashboard' },
  tutor:   { email: 'demo.tutor@studyworks.demo',   home: '/tutor/dashboard' },
};

export async function GET(request, { params }) {
  const { persona } = await params;
  const cfg = PERSONAS[persona];
  if (!cfg) {
    return NextResponse.json({ error: 'Unknown demo persona' }, { status: 404 });
  }

  // ?next= lets the slideshow link straight at a specific
  // screen ("View live: error log →") instead of dumping every
  // visitor at the dashboard. Validated to a same-origin path
  // so the redirect can't be turned into an open redirect.
  const url = new URL(request.url);
  const requested = url.searchParams.get('next');
  const dest =
    requested && requested.startsWith('/') && !requested.startsWith('//')
      ? requested
      : cfg.home;

  const service = createServiceClient();
  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: cfg.email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { error: 'Failed to mint demo session', detail: linkErr?.message },
      { status: 500 },
    );
  }

  // Hand the magic-link token to a normal (cookie-aware) client
  // and exchange it for a session. The session cookies land on
  // the response automatically via the cookies() accessor in
  // lib/supabase/server.js.
  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyErr) {
    return NextResponse.json(
      { error: 'Failed to verify demo session', detail: verifyErr.message },
      { status: 500 },
    );
  }

  return NextResponse.redirect(new URL(dest, url.origin));
}
