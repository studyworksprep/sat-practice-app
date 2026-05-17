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

// Paths that always serve from the legacy tree, regardless of
// ui_version. Two flavors live here:
//   - Route handlers under /auth that exchange Supabase codes for
//     sessions and redirect. They have no UI; one copy is enough.
//   - Marketing pages (features tour) that have no next-tree
//     counterpart yet. Subscribe, account/billing, login, and
//     /auth/update-password used to live here too; once the next
//     tree picked up matching pages they were dropped so a next
//     user lands on the new-tree version instead of the legacy
//     copy.
// Without this list, a next-default user hitting /features/students
// would be rewritten to a path that doesn't exist in app/next/*
// and fall into the catchall. Keep the list narrow.
const TREE_AGNOSTIC_PREFIXES = [
  '/auth/callback',
  '/auth/demo',
  '/features',
];

function isTreeAgnostic(pathname) {
  return TREE_AGNOSTIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

function userTreeFromJwt(user) {
  try {
    const meta = user?.app_metadata || user?.user_metadata || {};
    // Default is 'next'. The per-user flag is now an opt-OUT — only
    // ui_version='legacy' parks a user on the old tree. Anything
    // else (unset, 'next', stale value) lands on the new tree.
    return meta.ui_version === 'legacy' ? 'legacy' : 'next';
  } catch {
    return 'next';
  }
}

async function resolveUiTree(supabase, user) {
  // Kill switch takes priority.
  const force = await readKillSwitch(supabase);
  if (force === 'next') return 'next';
  if (force === 'legacy') return 'legacy';
  // Per-user flag from JWT, or the new-tree default for anonymous
  // visitors (so the marketing landing page is the next-tree one).
  if (user) return userTreeFromJwt(user);
  return 'next';
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

  // Static assets in /public — skip everything (auth, role gate,
  // subscription, UI-tree rewrite). Without this, a request for
  // /studyworks-logo.svg from a ui_version='next' user gets
  // rewritten to /next/studyworks-logo.svg, which doesn't exist
  // as a file, and the browser shows a broken image. The matcher
  // already excludes `_next/static`, `_next/image`, and
  // favicon.ico; we extend that here for any path whose last
  // segment carries a file extension (logos, manifest, robots,
  // and so on).
  if (/\/[^/]+\.[a-zA-Z0-9]{1,8}$/.test(request.nextUrl.pathname)) {
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

  // Demo-account write lockdown for REST mutations. The DB
  // enforces this authoritatively via the demo_readonly_*
  // restrictive policies, but rejecting raw /api/* writes here
  // is faster (no DB round-trip, no Postgres RLS error to
  // translate) and lets the response carry a clean
  // "demo accounts are read-only" message.
  //
  // Server actions (POSTs carrying the `next-action` header)
  // are deliberately NOT gated here. The proxy can't tell a
  // read action (countAvailable, searchQuestions) from a write
  // action (updateTargetScore), and read actions auto-fire on
  // mount from several pages — blocking them breaks the demo
  // experience. Demo writes from server actions still fail at
  // the DB layer via RLS; the user sees a Postgres "row
  // violates RLS" error in the rare case they click a button
  // that mutates, which is an acceptable trade for the demo
  // surface to navigate cleanly.
  //
  // External / public / webhook routes were already short-
  // circuited above, so we don't reach this block for them.
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
  // Auth route handlers (/auth/callback, /auth/demo) serve from the
  // legacy tree for everyone — see TREE_AGNOSTIC_PREFIXES — because
  // they have no UI and one copy is enough. The /login, /subscribe,
  // /account/billing, and /auth/update-password pages now live in
  // both trees, so they participate in the normal rewrite flow:
  // next users get the new-tree version, legacy users the legacy
  // one. Resolving uiTree here costs at most one cached kill-switch
  // read; the JWT lookup is local.
  const treeAgnostic = isTreeAgnostic(pathname);
  const uiTree = !isApiRoute && !isNextAsset
    ? await resolveUiTree(supabase, user)
    : 'next';

  // Surface the resolved tree on a request header so the root
  // app/layout.js (and the legacy NavBar in particular) can hide
  // itself authoritatively on /next pages — without that, NavBar
  // would have to re-derive the tree from the JWT and would
  // disagree with the proxy whenever the kill switch is set.
  requestHeaders.set('x-ui-tree', uiTree);

  let response;
  if (uiTree === 'next' && !treeAgnostic && !isApiRoute && !isNextAsset) {
    // Rewrite /foo -> /next/foo. Browser URL unchanged; Next.js serves
    // the file under app/next/foo. This is the Phase 1 on-ramp; the
    // new tree is an empty stub until Phase 2 fills it in.
    //
    // API routes are explicitly excluded: rewriting /api/signup to
    // /next/api/signup falls through to the app/next/[...slug] catch-
    // all page, which renders an HTML 200 — the caller's res.json()
    // then throws and the form shows "Something went wrong" while the
    // signup never executed. Same logic for already-/next/* paths.
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
