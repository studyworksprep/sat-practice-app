// /dashboard/stats moved to /performance (2026-09-19) when the full
// statistics became a first-class sidebar page. Redirect kept for old
// links.

import { redirect } from 'next/navigation';

export default function DashboardStatsRedirect() {
  redirect('/performance');
}
