'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { orderStudents, parseHistory, studentFromPath } from './dashboard-history';
import type { DashboardHistoryState } from './dashboard-history';

const HistoryContext = createContext<{
  history: DashboardHistoryState;
  togglePin: (studentId: string) => void;
  recordStudent: (studentId: string) => void;
  saved: boolean;
} | null>(null);

export function DashboardHistory({ userId, children }: { userId: string; children: ReactNode }) {
  const pathname = usePathname();
  const storageKey = `tutor-shortcuts:v1:${userId}`;
  const [history, setHistory] = useState<DashboardHistoryState>({ recent: [], pinned: [] });
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    function refresh(recordVisit = false) {
      try {
        const next = parseHistory(window.localStorage.getItem(storageKey));
        const studentId = studentFromPath(pathname);
        if (studentId && recordVisit) {
          next.recent = [studentId, ...next.recent.filter((id) => id !== studentId)].slice(0, 100);
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        }
        setHistory(next);
        setSaved(true);
      } catch {
        setSaved(false);
      }
    }
    refresh(true);
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) refresh(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [pathname, storageKey]);

  function recordStudent(studentId: string) {
    const next = { ...history, recent: [studentId, ...history.recent.filter((id) => id !== studentId)].slice(0, 100) };
    setHistory(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { setSaved(false); }
  }

  function togglePin(studentId: string) {
    const next = { ...history, pinned: history.pinned.includes(studentId)
      ? history.pinned.filter((id) => id !== studentId)
      : [studentId, ...history.pinned].slice(0, 100) };
    setHistory(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(true);
    } catch { setSaved(false); }
  }

  return <HistoryContext.Provider value={{ history, togglePin, recordStudent, saved }}>{children}</HistoryContext.Provider>;
}

export function useDashboardHistory<T extends { id: string }>(students: T[]) {
  const context = useContext(HistoryContext);
  const history = context?.history ?? { recent: [], pinned: [] };
  return { ...context, history, students: orderStudents(students, history) };
}
