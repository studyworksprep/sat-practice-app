// Suspense fallback for /tutor/assignments/new. The parent
// (tutor)/loading.js already renders a generic PageSkeleton, but
// nested-segment navigation between tutor routes often keeps the
// prior page on screen during the transition rather than swapping
// in the parent fallback. An explicit segment-level loading.js
// guarantees an instant skeleton the moment the link is clicked,
// so the New Assignment page (which has a non-trivial DB load)
// gives the tutor immediate visual feedback. The form has no
// stats tiles, so we drop the default tiles count to zero and
// use one card to suggest the upcoming form panel.

import { PageSkeleton } from '@/lib/ui/PageSkeleton';

export default function NewAssignmentLoading() {
  return <PageSkeleton tilesCount={0} cardsCount={1} />;
}
