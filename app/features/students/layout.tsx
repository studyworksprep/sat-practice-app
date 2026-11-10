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
  title: 'SAT & ACT Practice for Students — Studyworks',
  description:
    'SAT and ACT practice questions, full-length practice tests, short ' +
    'lessons, and score reports that show you what to study next.',
});

export default function StudentsFeatureLayout({ children }: { children: ReactNode }) {
  return children;
}
