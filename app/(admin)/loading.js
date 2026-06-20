// Suspense fallback for the (admin) tree.

import { PageSkeleton } from '@/lib/ui/PageSkeleton';

export default function AdminTreeLoading() {
  return <PageSkeleton />;
}
