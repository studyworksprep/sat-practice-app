// Metadata carrier for the tutor-manager persona deck. See the note
// in ../students/layout.tsx for why the metadata lives in a layout.
//
// This layout wraps the demo routes underneath it too, but those
// override it with their own noindex metadata (see ./demo/layout.tsx).

import type { ReactNode } from 'react';
import { publicPageMetadata } from '@/lib/config/site';

export const metadata = publicPageMetadata({
  path: '/features/tutor-managers',
  title: 'Tutor Training & Team Management — Studyworks',
  description:
    'Onboard new tutors on the real SAT content they will teach: assign ' +
    'practice, review the hard questions, and track each tutor’s readiness.',
});

export default function TutorManagersFeatureLayout({ children }: { children: ReactNode }) {
  return children;
}
