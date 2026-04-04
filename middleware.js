import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that practice-only users cannot access
const BLOCKED_FOR_PRACTICE = ['/dashboard', '/practice-test', '/admin', '/review'];

// Routes that use their own auth (e.g. API-key) and skip session auth
const EXTERNAL_API_PREFIX = '/api/external/';

export async function middleware(request) {
  // External API routes handle their own auth (API key) — skip session logic
  if (request.nextUrl.pathname.startsWith(EXTERNAL_API_PREFIX)) {
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

  // Role-based route protection for practice-only accounts
  if (user) {
    const pathname = request.nextUrl.pathname;
    const isBlocked = BLOCKED_FOR_PRACTICE.some(
      (route) => pathname === route || pathname.startsWith(route + '/')
    );

    if (isBlocked) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const role = profile?.role || 'practice';

      if (role === 'practice') {
        const url = request.nextUrl.clone();
        url.pathname = '/practice';
        return NextResponse.redirect(url);
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
