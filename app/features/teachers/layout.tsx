// Metadata carrier for the teacher/tutor persona deck. See the note
// in ../students/layout.tsx for why the metadata lives in a layout.

import type { ReactNode } from 'react';
import { publicPageMetadata } from '@/lib/config/site';

export const metadata = publicPageMetadata({
  path: '/features/teachers',
  title: 'SAT & ACT Tools for Teachers & Tutors — Studyworks',
  description:
    'Assign SAT and ACT practice and lessons, track every student’s mastery, ' +
    'and see what your whole class is struggling with, all in one place.',
});

export default function TeachersFeatureLayout({ children }: { children: ReactNode }) {
  return children;
}
