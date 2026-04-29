// Suspense fallback for the tutor-training runner. Mirrors the
// student runner's loading.js — runner-shaped skeleton on cold
// session entry / refresh, no fallback through to the generic
// (tutor) route-group skeleton. See app/next/(student)/practice
// /s/[sessionId]/loading.js for the rationale.

import { RunnerSkeleton } from '@/lib/ui/RunnerSkeleton';

export default function TutorTrainingSessionLoading() {
  return <RunnerSkeleton />;
}
