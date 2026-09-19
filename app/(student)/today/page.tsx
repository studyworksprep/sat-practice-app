// /today folded into the dashboard's Tasks box (2026-09-19). The route
// stays as a redirect so old links, help articles, and bookmarks keep
// working.

import { redirect } from 'next/navigation';

export default function TodayRedirect() {
  redirect('/dashboard');
}
