// Use an explicit zone on both server and client, including DST changes.
export const REPORT_TIME_ZONE = 'America/New_York';

export function reportDay(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function formatReportTimestamp(iso: string | null | undefined): string {
  if (!iso || !Number.isFinite(new Date(iso).getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIME_ZONE, year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(iso));
}

type Attempt = { created_at: string; is_correct: boolean | null; time_spent_ms?: number | null };

export function buildDailyMap(attempts: Attempt[], {
  firstDayOverride = null,
  now = new Date(),
}: { firstDayOverride?: string | null; now?: Date } = {}) {
  const byDay = new Map<string, { attempts: number; correct: number; timeMs: number }>();
  for (const a of attempts) {
    const day = reportDay(a.created_at);
    if (!day) continue;
    const entry = byDay.get(day) ?? { attempts: 0, correct: 0, timeMs: 0 };
    entry.attempts += 1;
    if (a.is_correct) entry.correct += 1;
    entry.timeMs += Math.max(0, a.time_spent_ms ?? 0);
    byDay.set(day, entry);
  }
  const firstAttempt = [...byDay.keys()].sort()[0] ?? null;
  const firstDay = firstDayOverride && (!firstAttempt || firstDayOverride < firstAttempt)
    ? firstDayOverride : firstAttempt;
  const lastDay = reportDay(now.toISOString());
  const days: Array<{ date: string; attempts: number; correct: number; timeMs: number }> = [];
  if (!firstDay) return { days, firstDay: null, lastDay: null, totalAttempts: 0 };
  // Calendar arithmetic in UTC avoids skipping/repeating days at DST boundaries.
  const cursor = new Date(`${firstDay}T00:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= lastDay) {
    const date = cursor.toISOString().slice(0, 10);
    days.push({ date, ...(byDay.get(date) ?? { attempts: 0, correct: 0, timeMs: 0 }) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { days, firstDay, lastDay, totalAttempts: days.reduce((sum, day) => sum + day.attempts, 0) };
}
