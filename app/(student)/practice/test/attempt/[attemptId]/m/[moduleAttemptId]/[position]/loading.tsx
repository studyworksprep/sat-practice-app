// Suspense fallback for the practice-test runner route. Without
// this, entering a module (launch, resume, module transition,
// refresh) fell back to the (student) group's dashboard-shaped
// PageSkeleton — the wrong silhouette behind Bluebook chrome.
// In-module Next/Back never hits this (§6.3b client-state nav);
// it covers the real route entries only.

import { TestRunnerSkeleton } from '@/lib/ui/TestRunnerSkeleton';

export default function PracticeTestRunnerLoading() {
  return <TestRunnerSkeleton />;
}
