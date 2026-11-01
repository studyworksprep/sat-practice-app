// Browser-local shortcuts contain IDs only; always intersect with the current roster.
export type DashboardHistoryState = { recent: string[]; pinned: string[] };

export function parseHistory(value: string | null): DashboardHistoryState {
  try {
    const parsed = JSON.parse(value ?? 'null');
    const ids = (list: unknown): string[] => Array.isArray(list)
      ? [...new Set(list.filter((id) => typeof id === 'string'))].slice(0, 100) : [];
    return { recent: ids(parsed?.recent), pinned: ids(parsed?.pinned) };
  } catch {
    return { recent: [], pinned: [] };
  }
}

export function studentFromPath(path: string) {
  return path.match(/^\/tutor\/(?:students|session)\/([^/]+)(?:\/|$)/)?.[1]
    ?? path.match(/^\/tutor\/assignments\/[^/]+\/students\/([^/]+)(?:\/|$)/)?.[1]
    ?? null;
}

export function orderStudents<T extends { id: string }>(students: T[], history: DashboardHistoryState): T[] {
  const byId = new Map(students.map((student) => [student.id, student]));
  const ids = [...new Set([...history.pinned, ...history.recent, ...byId.keys()])];
  return ids.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
}
