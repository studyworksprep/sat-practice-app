// Metadata carrier for the teacher/tutor persona deck. See the note
// in ../students/layout.tsx for why the metadata lives in a layout.

import type { ReactNode } from 'react';
import { publicPageMetadata } from '@/lib/config/site';

export const metadata = publicPageMetadata({
  path: '/features/teachers',
  title: 'SAT Tools for Teachers & Tutors — Studyworks',
  description:
    'Assign practice, track every student, and see the domains and questions ' +
    'your whole class is struggling with — in one roster view.',
});

export default function TeachersFeatureLayout({ children }: { children: ReactNode }) {
  return children;
}
