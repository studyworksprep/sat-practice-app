// Dashboard-segment loading.js. Overrides the route group's
// generic PageSkeleton with a dashboard-shaped skeleton (banner +
// stats row + perf grid + bottom row + target card) so the cold-
// start latency on this page — 9+ parallel queries on every
// visit per (student)/dashboard/page.js — lands on a layout that
// matches the real dashboard, not a generic placeholder.

import { DashboardSkeleton } from '@/lib/ui/DashboardSkeleton';

export default function StudentDashboardLoading() {
  return <DashboardSkeleton />;
}
