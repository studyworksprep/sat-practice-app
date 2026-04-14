import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createJsClient } from '@supabase/supabase-js';

// Server-side Supabase client for use inside route handlers, Server
// Components, and Server Actions. Async because Next.js 15+ made
// `cookies()` from `next/headers` return a Promise. Every caller does
// `const supabase = await createClient()`.
//
// Uses the modern `getAll` / `setAll` cookies accessor pattern from
// @supabase/ssr 0.10+. The legacy `get` / `set` / `remove` shape is
// deprecated and will be removed in the next major version.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll() called from a Server Component context where the
            // Next.js cookie store is read-only. Safe to ignore — the
            // proxy/middleware refreshes the session before each
            // navigation, so cookies are always written from there.
          }
        },
      },
    },
  );
}

// Service-role client that bypasses RLS. Use only in server-side code
// after the caller has already been authenticated and authorised.
// Does NOT depend on cookies() so it stays synchronous.
export function createServiceClient() {
  return createJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
