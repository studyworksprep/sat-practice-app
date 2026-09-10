// Metadata carrier for the student persona deck.
//
// The page itself is a 'use client' slideshow, and a client component
// cannot export `metadata` — Next only reads that export from server
// components. A thin server layout is the standard way to give a
// client page a title, description and canonical.

import type { ReactNode } from 'react';
import { publicPageMetadata } from '@/lib/config/site';

export const metadata = publicPageMetadata({
  path: '/features/students',
  title: 'SAT Practice for Students — Studyworks',
  description:
    'A question bank, adaptive practice tests, and score reports that show ' +
    'you which SAT skills to study next for the biggest score gain.',
});

export default function StudentsFeatureLayout({ children }: { children: ReactNode }) {
  return children;
}
