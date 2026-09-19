// Dashboard · Recently finished — the unified list of the most recent
// completed practice sessions, practice-test attempts, and assignments,
// each linking to its report. This is the "what did I just do?" surface
// a tutor and student pull up at the start of a session. page.js shapes
// the entries; this renders them.

import Link from 'next/link';
import { ClipboardCheckIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import s from './Dashboard.module.css';

export type FinishedKind = 'session' | 'act_session' | 'test' | 'assignment';

export interface FinishedEntry {
  kind: FinishedKind;
  id: string;
  title: string;
  subtitle?: string | null;
  finishedAt: string;
  metric: string;
  tone: 'good' | 'ok' | 'warn' | 'neutral';
  href: string;
}

export function RecentlyFinished({ entries }: { entries: FinishedEntry[] }) {
  return (
    <section className={s.card} aria-labelledby="dashboard-finished">
      <div className={s.cardHeader}>
        <div>
          <h2 id="dashboard-finished" className={s.sectionLabel}>
            <IconTile icon={ClipboardCheckIcon} palette="success" size="sm" />
            Recently finished
          </h2>
          <div className={s.cardSub}>
            The work you&apos;ve closed out most recently — click to jump to its report.
          </div>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className={s.empty}>
          Nothing here yet.{' '}
          <Link href="/practice/start" className={s.inlineLink}>
            Start a practice session →
          </Link>
        </p>
      ) : (
        <ul className={s.finishedList}>
          {entries.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <Link href={row.href} className={s.finishedRow}>
                <span className={`${s.typeBadge} ${s[`typeBadge_${row.kind}`]}`}>
                  {kindLabel(row.kind)}
                </span>
                <div className={s.finishedMain}>
                  <div className={s.finishedTitle}>
                    {row.title}
                    {row.subtitle && (
                      <span className={s.finishedSubtitle}> · {row.subtitle}</span>
                    )}
                  </div>
                  <div className={s.finishedMeta}>
                    <span className={`${s.finishedMetric} ${s[`metricTone_${row.tone}`]}`}>
                      {row.metric}
                    </span>
                    <span className={s.finishedDot}>·</span>
                    <span className={s.finishedDate}>{formatRowDate(row.finishedAt)}</span>
                  </div>
                </div>
                <span className={s.finishedChevron} aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function kindLabel(kind: FinishedKind): string {
  switch (kind) {
    case 'assignment': return 'Assignment';
    case 'test': return 'Practice test';
    case 'session': return 'Practice';
    case 'act_session': return 'ACT practice';
    default: return kind;
  }
}

function formatRowDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (sameDay) return `Today, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
