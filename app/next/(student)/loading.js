// Suspense fallback for every (student)-tree page. Picked up
// automatically by Next.js whenever a navigation lands inside
// this route group, so the URL changes immediately and the
// student sees a skeleton instead of the previous page hanging
// for 1–2 seconds while parallel queries finish.

import { PageSkeleton } from '@/lib/ui/PageSkeleton';

export default function StudentTreeLoading() {
  return <PageSkeleton />;
}
