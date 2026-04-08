import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that practice-only users cannot access
const BLOCKED_FOR_PRACTICE = ['/dashboard', '/practice-test', '/admin', '/review'];

// Routes that require an active subscription (or exemption)
const SUBSCRIPTION_REQUIRED = ['/practice', '/practice-test', '/review', '/dashboard', '/teacher'];

// Routes that are always accessible (no subscription check)
const ALWAYS_ACCESSIBLE = ['/', '/login', '/subscribe', '/features', '/account', '/auth'];

// Routes that use their own auth (e.g. API-key) and skip session auth
const EXTERNAL_API_PREFIX = '/api/external/';

export async function middleware(request) {
  // External/public API routes and webhooks handle their own auth — skip session logic
  if (
    request.nextUrl.pathname.startsWith(EXTERNAL_API_PREFIX) ||
    request.nextUrl.pathname.startsWith('/api/public/') ||
    request.nextUrl.pathname.startsWith('/api/webhooks/')
  ) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);

  // We'll collect cookies set during auth refresh, then apply them to the final response
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

  // Refresh session if expired - important for Server Components
  const { data: { user } } = await supabase.auth.getUser();

  // Pass authenticated user ID to route handlers via request header
  if (user) {
    requestHeaders.set('x-user-id', user.id);
  }

  // Route protection for logged-in users
  if (user) {
    const pathname = request.nextUrl.pathname;

    // Only fetch profile once for both checks
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
        url.pathname = '/practice';
        return NextResponse.redirect(url);
      }

      // Subscription check: skip for exempt roles/users and fresh checkout redirects
      if (needsSubCheck && !justCheckedOut && !['admin', 'manager'].includes(role) && !profile?.subscription_exempt) {
        // Check for active subscription
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
