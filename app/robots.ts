// Serves /robots.txt (Next metadata route).
//
// A missing robots.txt does not itself block anything — RFC 9309 says
// a 404 means "crawl freely" — so this file is not here to unblock
// crawlers. It is here to do the opposite job well: point them at the
// sitemap, and keep them out of the signed-in surface.
//
// That second part is the real win. Every authenticated route 307s to
// /login, so a crawler that wanders into /dashboard, /practice/... or
// /tutor/... gets a login page back. Hundreds of distinct URLs all
// answering with the same login HTML is exactly the pattern a search
// engine reads as a thin, duplicative site, and exactly the pattern a
// school content filter samples when deciding what kind of site this
// is. Naming those prefixes here means the only pages anyone crawls
// are the ones that actually describe the product.
//
// The proxy lets this through without touching auth: proxy.js
// short-circuits any path whose last segment has a file extension.

import type { MetadataRoute } from 'next';
import { absoluteUrl, siteUrl } from '@/lib/config/site';

// Prefixes that require a session (or redirect into one). Written
// without a trailing slash on purpose: a robots.txt rule is a literal
// prefix match, so `/practice` covers both `/practice` itself (which
// 308s to /practice/start) and everything beneath it, where
// `/practice/` would miss the bare path. None of these prefixes is a
// prefix of a public page — the public set is `/`, `/features/*`,
// `/login` and `/subscribe`.
const AUTHENTICATED_PREFIXES = [
  // Student surface
  '/dashboard',
  '/today',
  '/welcome',
  '/practice',
  '/learn',
  '/review',
  '/notes',
  '/flashcards',
  '/assignments',
  '/help',
  // Staff surfaces
  '/admin',
  '/tutor',
  '/contribute',
  // Per-user account + auth plumbing
  '/account',
  '/auth',
  // Legacy paths that 308 into the gated surface above
  '/teacher',
  '/practice-test',
  '/act-practice',
  // API and the Sentry client-error tunnel
  '/api',
  '/monitoring',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The sales demos under /features/tutor-managers/demo are
      // public but deliberately kept out of the index. They are NOT
      // disallowed here: a disallowed URL is never fetched, so the
      // crawler never reads the noindex that would drop it, and
      // Google can still list a blocked URL on link evidence alone.
      // Crawl-and-noindex is the combination that actually removes a
      // page; the noindex lives in that route's layout.
      disallow: AUTHENTICATED_PREFIXES,
    },
    sitemap: absoluteUrl('/sitemap.xml'),
    host: siteUrl,
  };
}
