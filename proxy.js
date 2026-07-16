import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that practice-only users cannot access. They get redirected to
// /practice/start (the picker — what was /practice in the legacy tree).
const BLOCKED_FOR_PRACTICE = [
  '/dashboard',
  '/practice/tests',
  '/practice/test',
  '/admin',
  '/review',
  '/tutor',
];

// Routes that require an active subscription (or exemption).
const SUBSCRIPTION_REQUIRED = ['/practice', '/review', '/dashboard', '/tutor', '/today'];

// Routes that are always accessible (no subscription check).
const ALWAYS_ACCESSIBLE = ['/', '/login', '/subscribe', '/features', '/account', '/auth'];

// Routes that use their own auth (e.g. API-key) and skip session auth.
const EXTERNAL_API_PREFIX = '/api/external/';

// Legacy → next URL renames. 308 permanent so bookmarks and search
// engines learn the new shape, and emailed score-report links keep
// resolving after the legacy tree is gone. Order matters — more-specific
// patterns first so /teacher/content/[id] doesn't get caught by /teacher.
//
// Two legacy URLs intentionally do NOT redirect — there is no clean
// mapping from a question-id to a session-id, so they 404:
//   /practice/[questionId]    (single-question entry replaced by sessions)
//   /act-practice/[questionId]
const LEGACY_REDIRECTS = [
  { from: /^\/teacher\/content\/([^/]+)\/?$/, to: (m) => `/tutor/lesson-packs/${m[1]}` },
  { from: /^\/teacher\/content\/?$/,           to: () => `/tutor/lesson-packs` },
  { from: /^\/teacher\/performance\/?$/,       to: () => `/tutor/performance` },
  { from: /^\/teacher\/review\/([^/]+)\/?$/,   to: (m) => `/tutor/review/${m[1]}` },
  { from: /^\/teacher\/students\/?$/,          to: () => `/tutor/roster` },
  { from: /^\/teacher\/student\/([^/]+)\/stats\/?$/, to: (m) => `/tutor/students/${m[1]}/stats` },
  { from: /^\/teacher\/?$/,                    to: () => `/tutor/dashboard` },
  { from: /^\/teachers\/?$/,                   to: () => `/tutor/teachers` },
  { from: /^\/practice-test\/attempt\/([^/]+)\/results\/?$/, to: (m) => `/practice/test/attempt/${m[1]}/results` },
  { from: /^\/practice-test\/attempt\/([^/]+)\/?$/,          to: (m) => `/practice/test/attempt/${m[1]}` },
  { from: /^\/practice-test\/?$/,              to: () => `/practice/tests` },
  { from: /^\/practice\/?$/,                   to: () => `/practice/start` },
  { from: /^\/act-practice\/?$/,               to: () => `/practice/start` },
  { from: /^\/admin\/lessons\/([^/]+)\/editor\/?$/, to: (m) => `/admin/lessons/${m[1]}` },
];

function matchLegacyRedirect(pathname) {
  for (const r of LEGACY_REDIRECTS) {
    const m = pathname.match(r.from);
    if (m) return r.to(m);
  }
  return null;
}

export async function proxy(request) {
  // External/public API routes and webhooks handle their own auth — skip session logic.
  if (
    request.nextUrl.pathname.startsWith(EXTERNAL_API_PREFIX) ||
    request.nextUrl.pathname.startsWith('/api/public/') ||
    request.nextUrl.pathname.startsWith('/api/webhooks/')
  ) {
    return NextResponse.next();
  }

  // Static assets in /public — skip everything (auth, role gate, subscription).
  // Without this, paths like /studyworks-logo.svg fall into the role/subscription
  // gates and can be 302'd to /login. The matcher already excludes _next/static,
  // _next/image, and favicon.ico; we extend that here for any path whose last
  // segment carries a file extension (logos, manifest, robots, and so on).
  if (/\/[^/]+\.[a-zA-Z0-9]{1,8}$/.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;

  // Legacy URL renames — 308 redirect before session refresh, so bookmarks
  // and emailed links jump straight to the new URL with no auth cost.
  const redirectTo = matchLegacyRedirect(pathname);
  if (redirectTo) {
    const url = request.nextUrl.clone();
    url.pathname = redirectTo;
    return NextResponse.redirect(url, 308);
  }

  const requestHeaders = new Headers(request.headers);
  const cookiesToSet = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          cookiesToSet.push({ name, value, ...options });
        },
        remove(name, options) {
          cookiesToSet.push({ name, value: '', ...options });
        },
      },
    }
  );

  // Refresh session if expired — important for Server Components
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    requestHeaders.set('x-user-id', user.id);
  }

  // Demo-account write lockdown for REST mutations. The DB enforces this
  // authoritatively via the demo_readonly_* restrictive policies, but rejecting
  // raw /api/* writes here is faster (no DB round-trip, no Postgres RLS error
  // to translate) and lets the response carry a clean
  // "demo accounts are read-only" message.
  //
  // Server actions (POSTs carrying the `next-action` header) are deliberately
  // NOT gated here. The proxy can't tell a read action (countAvailable,
  // searchQuestions) from a write action (updateTargetScore), and read actions
  // auto-fire on mount from several pages — blocking them breaks the demo
  // experience. Demo writes from server actions still fail at the DB layer
  // via RLS; the user sees a Postgres "row violates RLS" error in the rare
  // case they click a button that mutates, which is an acceptable trade for
  // the demo surface to navigate cleanly.
  const isDemoSession = user?.app_metadata?.is_demo === true;
  if (isDemoSession) {
    const isApiMutation =
      pathname.startsWith('/api/') &&
      request.method !== 'GET' &&
      request.method !== 'HEAD';
    if (isApiMutation) {
      return new NextResponse(
        JSON.stringify({ error: 'Demo accounts are read-only' }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    }
  }

  // Pass the original request pathname so server components / layouts can read
  // it via headers() when they need to (Next.js doesn't expose pathname to
  // layouts directly). Used by the (student) layout to allow shared-infra
  // paths like /practice/test/* through for non-student roles.
  requestHeaders.set('x-pathname', pathname);

  // Route protection for logged-in users.
  if (user) {
    const needsRoleCheck = BLOCKED_FOR_PRACTICE.some(r => pathname === r || pathname.startsWith(r + '/'));
    const needsSubCheck =
      !pathname.startsWith('/api/') &&
      SUBSCRIPTION_REQUIRED.some(r => pathname === r || pathname.startsWith(r + '/')) &&
      !ALWAYS_ACCESSIBLE.some(r => pathname === r || pathname.startsWith(r + '/'));

    // Skip subscription check if user just completed checkout (webhook may not
    // have arrived yet).
    const justCheckedOut = request.nextUrl.searchParams.get('checkout') === 'success';

    if (needsRoleCheck || needsSubCheck) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, subscription_exempt')
        .eq('id', user.id)
        .maybeSingle();
      const role = profile?.role || 'practice';

      if (needsRoleCheck && role === 'practice') {
        const url = request.nextUrl.clone();
        url.pathname = '/practice/start';
        return NextResponse.redirect(url);
      }

      // Staff roles (admin, manager, teacher) get full access via a role
      // bypass — the subscription gate is for students / practice users, not
      // the people who run the tutor tree. This matches the entitlements
      // design (supabase/migrations/20260713220000_entitlements.sql: "Staff
      // (admin/manager/teacher) get 'full' via a role bypass"). Historically
      // only admin/manager were listed here and teachers relied on
      // subscription_exempt=true being set at provisioning time; a teacher
      // without that flag was wrongly bounced to /subscribe off /tutor/*,
      // which is exactly what the e2e-auth teacher suite catches.
      if (needsSubCheck && !justCheckedOut && !['admin', 'manager', 'teacher'].includes(role) && !profile?.subscription_exempt) {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('user_id', user.id)
          .in('status', ['active', 'trialing'])
          .maybeSingle();

        if (!sub) {
          const url = request.nextUrl.clone();
          url.pathname = '/subscribe';
          return NextResponse.redirect(url);
        }
      }
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Apply auth cookies (refresh tokens etc.) to the response
  for (const cookie of cookiesToSet) {
    response.cookies.set(cookie);
  }

  return response;
}

export const config = {
  matcher: [
    /*
      Match all request paths except:
      - _next/static (static files)
      - _next/image (image optimization files)
      - favicon.ico (favicon file)
    */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
