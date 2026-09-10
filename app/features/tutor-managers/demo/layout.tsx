// The three routes under here are interactive sales demos — mock
// manager dashboards reachable without a session, linked from the
// tutor-manager deck.
//
// They are public on purpose but should not be indexed: standing on
// their own in a results page they read as broken app screens with no
// context, and they would compete with /features/tutor-managers,
// which is the page that actually explains them. `follow: true`
// because the links back into the real marketing pages are still
// worth crawling.
//
// Deliberately noindex rather than a robots.txt Disallow: a
// disallowed URL is never fetched, so this directive would never be
// read, and a blocked URL can still surface in results on link
// evidence alone. Crawl-and-noindex is what actually keeps a page
// out. See app/robots.ts.

import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  // Drop the canonical inherited from ../layout.tsx. Without this
  // these pages carry rel=canonical pointing at
  // /features/tutor-managers while also saying noindex — two
  // directives about different URLs, which Google explicitly warns
  // against combining because it can't tell which one you meant.
  // noindex on its own is unambiguous.
  alternates: { canonical: null },
};

export default function TutorManagerDemoLayout({ children }: { children: ReactNode }) {
  return children;
}
