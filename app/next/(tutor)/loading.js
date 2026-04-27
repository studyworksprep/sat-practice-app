// Suspense fallback for every (tutor)-tree page. See the matching
// (student) loading.js for the reasoning — instant URL change
// + skeleton instead of click-then-wait.

import { PageSkeleton } from '@/lib/ui/PageSkeleton';

export default function TutorTreeLoading() {
  return <PageSkeleton />;
}
