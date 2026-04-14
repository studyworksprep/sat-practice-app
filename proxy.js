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

// =========================================================
// Parallel-build tree resolver. See docs/architecture-plan.md §3.6.
//
// Each user has a `ui_version` that routes them to either the legacy
// tree (`app/*`) or the new tree (`app/next/*`). The value comes from:
//   1) feature_flags.force_ui_version   (kill switch, cached ~5s)
//   2) auth.jwt().app_metadata.ui_version  (per-user, zero DB hops)
//   3) 'legacy'                          (default)
//
// For non-API routes where the resolved tree is 'next', we rewrite the
// URL to `/next/<original-path>` so Next.js serves the file under
// `app/next/...`. The browser URL is unchanged. API routes are not
// rewritten — backend handlers branch internally if they need to.
//
// During Phase 1 the new tree is an empty stub. A 'next' user reaching
// `/dashboard` will be rewritten to `/next/dashboard`, which will 404
// until Phase 2 fills in the page. Only internal accounts should be
// flipped to 'next' until that content exists.
//
// The kill-switch cache is a module-scoped object refreshed every 5
// seconds. Module state persists within a single serverless function
// instance; across cold starts we re-fetch. Worst-case lag from a flag
// flip to user-visible effect is ~5 seconds plus cold-start time.
// =========================================================
const KILL_SWITCH_TTL_MS = 5000;
const killSwitchCache = { value: undefined, fetchedAt: 0 };

async function readKillSwitch(supabase) {
  const now = Date.now();
  if (killSwitchCache.value !== undefined && now - killSwitchCache.fetchedAt < KILL_SWITCH_TTL_MS) {
    return killSwitchCache.value;
  }
  try {
    const { data } = await supabase
      .from('feature_flags')
      .select('value')
      .eq('key', 'force_ui_version')
      .maybeSingle();
    const value = data?.value ?? null;
    killSwitchCache.value = value;
    killSwitchCache.fetchedAt = now;
    return value;
  } catch {
    // If the read fails (table missing during rollout, network blip,
    // etc.) fall through to the per-user flag. Never break the site
    // because of an observability read.
    return killSwitchCache.value ?? null;
  }
}

function userTreeFromJwt(user) {
  try {
    const meta = user?.app_metadata || user?.user_metadata || {};
    const v = meta.ui_version;
    return v === 'next' ? 'next' : 'legacy';
  } catch {
    return 'legacy';
  }
}

async function resolveUiTree(supabase, user) {
  // Kill switch takes priority.
  const force = await readKillSwitch(supabase);
  if (force === 'next') return 'next';
  if (force === 'legacy') return 'legacy';
  // Per-user flag from JWT.
  if (user) return userTreeFromJwt(user);
  return 'legacy';
}

export async function proxy(request) {
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

  const pathname = request.nextUrl.pathname;

  // Route protection for logged-in users
  if (user) {
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

  // Resolve which UI tree this user should see (legacy vs next).
  // Zero DB hops for legacy users: the JWT carries ui_version.
  // One occasional DB hit for the kill switch (cached ~5s per instance).
  const isApiRoute = pathname.startsWith('/api/');
  const isNextAsset = pathname.startsWith('/_next/') || pathname.startsWith('/next/');
  const uiTree = !isApiRoute && !isNextAsset ? await resolveUiTree(supabase, user) : 'legacy';

  let response;
  if (uiTree === 'next') {
    // Rewrite /foo -> /next/foo. Browser URL unchanged; Next.js serves
    // the file under app/next/foo. This is the Phase 1 on-ramp; the
    // new tree is an empty stub until Phase 2 fills it in.
    const url = request.nextUrl.clone();
    url.pathname = `/next${pathname === '/' ? '' : pathname}`;
    response = NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
  } else {
    response = NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

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
