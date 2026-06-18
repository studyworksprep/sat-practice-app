import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that practice-only users cannot access
const BLOCKED_FOR_PRACTICE = ['/dashboard', '/admin', '/review', '/tutor', '/practice/test', '/practice/tests'];

// Routes that require an active subscription (or exemption)
const SUBSCRIPTION_REQUIRED = ['/practice', '/review', '/dashboard', '/tutor', '/admin'];

// Routes that are always accessible (no subscription check)
const ALWAYS_ACCESSIBLE = ['/', '/login', '/subscribe', '/features', '/account', '/auth'];

// Routes that use their own auth (e.g. API-key) and skip session auth
const EXTERNAL_API_PREFIX = '/api/external/';

export async function proxy(request) {
  // External/public API routes and webhooks handle their own auth — skip session logic
  if (
    request.nextUrl.pathname.startsWith(EXTERNAL_API_PREFIX) ||
    request.nextUrl.pathname.startsWith('/api/public/') ||
    request.nextUrl.pathname.startsWith('/api/webhooks/')
  ) {
    return NextResponse.next();
  }

  // Static assets in /public — skip auth/role/subscription entirely.
  // The matcher already excludes `_next/static`, `_next/image`, and
  // favicon.ico; this extends that to any path whose last segment
  // carries a file extension (logos, manifest, robots, and so on).
  if (/\/[^/]+\.[a-zA-Z0-9]{1,8}$/.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);

  // Collect cookies set during auth refresh, then apply them to the final response.
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

  // Refresh session if expired — important for Server Components.
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    requestHeaders.set('x-user-id', user.id);
  }

  // Demo-account write lockdown for REST mutations. The DB enforces
  // this authoritatively via the demo_readonly_* restrictive policies,
  // but rejecting raw /api/* writes here is faster (no DB round-trip,
  // no Postgres RLS error to translate) and lets the response carry a
  // clean "demo accounts are read-only" message.
  //
  // Server actions (POSTs carrying the `next-action` header) are
  // deliberately NOT gated here. The proxy can't tell a read action
  // (countAvailable, searchQuestions) from a write action
  // (updateTargetScore), and read actions auto-fire on mount from
  // several pages — blocking them breaks the demo experience. Demo
  // writes from server actions still fail at the DB layer via RLS.
  //
  // External / public / webhook routes were already short-circuited
  // above, so we don't reach this block for them.
  const isDemoSession = user?.app_metadata?.is_demo === true;
  if (isDemoSession) {
    const isApiMutation =
      request.nextUrl.pathname.startsWith('/api/') &&
      request.method !== 'GET' &&
      request.method !== 'HEAD';
    if (isApiMutation) {
      return new NextResponse(
        JSON.stringify({ error: 'Demo accounts are read-only' }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    }
  }

  // Pass the original request pathname so server components / layouts
  // can read it via headers() when they need to (Next.js doesn't
  // expose pathname to layouts directly). Used by the (student)
  // layout to allow shared-infra paths like /practice/test/* through
  // for non-student roles.
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  const pathname = request.nextUrl.pathname;

  // Route protection for logged-in users.
  if (user) {
    const needsRoleCheck = BLOCKED_FOR_PRACTICE.some(r => pathname === r || pathname.startsWith(r + '/'));
    const needsSubCheck = !pathname.startsWith('/api/') &&
      SUBSCRIPTION_REQUIRED.some(r => pathname === r || pathname.startsWith(r + '/')) &&
      !ALWAYS_ACCESSIBLE.some(r => pathname === r || pathname.startsWith(r + '/'));

    // Skip subscription check if user just completed checkout (webhook may not have arrived yet)
    const justCheckedOut = request.nextUrl.searchParams.get('checkout') === 'success';

    if (needsRoleCheck || needsSubCheck) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, subscription_exempt')
        .eq('id', user.id)
        .maybeSingle();
      const role = profile?.role || 'practice';

      // Practice-only users can't access teacher/admin routes
      if (needsRoleCheck && role === 'practice') {
        const url = request.nextUrl.clone();
        url.pathname = '/practice/start';
        return NextResponse.redirect(url);
      }

      // Subscription check: skip for exempt roles/users and fresh checkout redirects
      if (needsSubCheck && !justCheckedOut && !['admin', 'manager'].includes(role) && !profile?.subscription_exempt) {
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
