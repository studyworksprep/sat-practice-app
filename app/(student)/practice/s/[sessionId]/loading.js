// Suspense fallback for the practice runner. Sits at the
// [sessionId] segment so any direct hit / refresh / deep-link
// inside a session pops the runner-shaped skeleton (header → two
// panes → map footer) instead of the generic dashboard skeleton
// that the (student) route group would otherwise serve. Adjacent
// question clicks inside an already-mounted session don't pass
// through here — they navigate via local state in
// PracticeInteractive — so this only fires on the cold-start path.

import { RunnerSkeleton } from '@/lib/ui/RunnerSkeleton';

export default function PracticeSessionLoading() {
  return <RunnerSkeleton />;
}
