// Serves /sitemap.xml (Next metadata route).
//
// Only genuinely public, indexable pages belong here — a sitemap that
// lists URLs which redirect to /login teaches a crawler to distrust
// the whole file. Everything else on this deployment either 307s to
// /login for anonymous visitors or is deliberately noindex, so the
// public surface really is this short:
//
//   /                            landing + login/signup
//   /features/students           persona deck
//   /features/teachers           persona deck
//   /features/tutor-managers     persona deck
//   /subscribe                   plans and pricing
//
// /login is deliberately absent: it renders the same HomeClient as
// `/`, so it carries a canonical pointing at `/` (see
// app/login/page.js) and does not need its own sitemap entry.
//
// Verified against production 2026-09-10 by requesting each path
// anonymously; re-check with the same sweep if routes move.

import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/config/site';

type Entry = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
};

const PUBLIC_PAGES: Entry[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/features/students', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/features/teachers', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/features/tutor-managers', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/subscribe', changeFrequency: 'monthly', priority: 0.6 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_PAGES.map(({ path, changeFrequency, priority }) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency,
    priority,
  }));
}
