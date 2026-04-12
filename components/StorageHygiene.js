'use client';

// Tiny client component that runs once on mount and prunes old
// practice_session_* entries from localStorage down to the LRU cap.
//
// Why this exists: students who hit the QuotaExceededError bug from
// before lib/practiceSessionStorage.js landed have bloated storage
// that doesn't self-clean. The new helper LRU-evicts on every write,
// but if the student's broken setItem fires during component mount
// (e.g. inside the dashboard's effect chain), the page can crash
// before any write succeeds and triggers the cleanup. By calling
// pruneOldPracticeSessions in a useEffect on a component that mounts
// at the layout level, we run the cleanup before any of the
// failure-prone setItem paths get a chance to fire on the next page
// load — so affected students self-heal automatically.
//
// Renders nothing. Safe to mount unconditionally for every user.

import { useEffect } from 'react';
import { pruneOldPracticeSessions } from '../lib/practiceSessionStorage';

export default function StorageHygiene() {
  useEffect(() => {
    pruneOldPracticeSessions();
  }, []);
  return null;
}
