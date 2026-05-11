import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

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
// magic-link `action_link` (a Supabase /verify URL with the
// hashed token already baked in), then 302-redirect the
// browser to it. Supabase /verify exchanges the token for a
// session and redirects to our existing /auth/callback?code=…
// endpoint, which is the same code path a real magic-link click
// uses. This avoids the route having to write session cookies
// itself, which is fragile across @supabase/ssr versions.
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

function plainError(message, status = 500, detail) {
  // Route handlers must return Response objects, not throw — a
  // thrown error here would bubble up to whichever error.js
  // boundary Next happens to attach (often the wrong one), and
  // the user sees a generic "Something went wrong" page with no
  // useful detail. Returning a plain HTML error page keeps the
  // failure mode legible.
  const body = `<!doctype html>
<html><head><meta charset="utf-8"><title>Demo session error</title></head>
<body style="font-family:system-ui;max-width:560px;margin:4rem auto;padding:0 1.5rem;color:#1f2937">
  <h1 style="font-size:1.5rem;margin:0 0 0.5rem">Couldn't start the demo</h1>
  <p>${escapeHtml(message)}</p>
  ${detail ? `<pre style="background:#f3f4f6;padding:12px;border-radius:8px;font-size:12px;overflow:auto">${escapeHtml(detail)}</pre>` : ''}
  <p><a href="/" style="color:#1d4ed8">← Back to home</a></p>
</body></html>`;
  return new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(request, { params }) {
  try {
    const { persona } = await params;
    const cfg = PERSONAS[persona];
    if (!cfg) {
      return plainError(`Unknown demo persona: ${persona}`, 404);
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

    // Where Supabase's /verify endpoint should redirect after it
    // mints the session. /auth/callback handles the code-for-
    // session exchange via exchangeCodeForSession() and then
    // forwards to ?next=…
    const callback = new URL('/auth/callback', url.origin);
    callback.searchParams.set('next', dest);

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return plainError(
        'Server is missing SUPABASE_SERVICE_ROLE_KEY.',
        500,
      );
    }

    const service = createServiceClient();
    const { data, error } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email: cfg.email,
      options: { redirectTo: callback.toString() },
    });
    if (error || !data?.properties?.action_link) {
      return plainError(
        'Could not generate a demo session link.',
        500,
        error?.message,
      );
    }

    return NextResponse.redirect(data.properties.action_link);
  } catch (err) {
    return plainError(
      'Unexpected error while starting the demo session.',
      500,
      err?.message,
    );
  }
}
