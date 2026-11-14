// Roster interactive — search, Active / Past toggle and sort on one
// line, then the table. Receives the whole roster from the Server
// Component so filtering and sorting run locally.
//
// Two table shapes share the surface:
//
//   Active — Student (school · class) / Last active / Plan /
//            Score / goal / Test / Assignments / [Foundations] / actions
//   Past   — Name / Starting / Final / Impact / Target / Reach / Restore
//
// Each active row has one visible action, Session; everything else
// (assign work, the study plan, quick edit, archive) sits in the row's
// ⋯ menu so the table reads as a list of students, not of buttons.
//
// The default sort, "Needs attention first", ranks by the same weight
// as the dashboard's Needs-your-attention list (lib/tutor/dashboard-
// attention): plan behind, overdue work, a week without practice.
//
// The Foundations column (foundations doc §3.2) appears once a section
// syllabus has a published lesson.

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatRelativeShort } from '@/lib/formatters';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import { ACTIVITY_LOOKBACK_DAYS, daysSince, daysUntil, IDLE_DAYS, type StudentSignals } from '@/lib/tutor/dashboard-attention';
import { QuickEditModal } from './QuickEditModal';
import { updateStudentProfile } from './actions';
import s from './Roster.module.css';

interface PlanInfo { status: string; label: string; line: string; overdueCount: number }
interface FoundationsSummary { covered: number; total: number }
interface AccessBadge { tone: 'warn' | 'info'; label: string; title: string }
interface ArchiveSummary {
  startingScore?: number | null;
  finalScore?: number | null;
  impact?: number | null;
  targetReachPct?: number | null;
}

export interface RosterStudent {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  highSchool: string | null;
  graduationYear: number | null;
  targetScore: number | null;
  startDate: string | null;
  isActive: boolean;
  plan: PlanInfo | null;
  hasPlanDraft: boolean;
  foundations: FoundationsSummary | null;
  signals?: StudentSignals | null;
  attentionWeight?: number;
  archive?: ArchiveSummary;
  /** Only set when the tutor should act: no subscription, failed
   *  payment, or a trial (lib/tutor/roster-access.ts). */
  access?: AccessBadge | null;
}

type Sort = { label: string; cmp: (a: RosterStudent, b: RosterStudent) => number };

const PLAN_URGENCY: Record<string, number> = { behind: 0, not_started: 1, on_track: 2, ahead: 3 };
const planUrgency = (st: RosterStudent) => (st.plan ? PLAN_URGENCY[st.plan.status] ?? 4 : 5);
const byName = (a: RosterStudent, b: RosterStudent) => nameOf(a).localeCompare(nameOf(b));
// Missing values sort last in either direction.
const last = (v: number | null | undefined) => (v == null ? Number.POSITIVE_INFINITY : v);

const ACTIVE_SORTS: Record<string, Sort> = {
  attention: {
    label: 'Needs attention first',
    cmp: (a, b) => (b.attentionWeight ?? 0) - (a.attentionWeight ?? 0) || byName(a, b),
  },
  name: { label: 'Name (A–Z)', cmp: byName },
  lastActive: {
    label: 'Last active',
    cmp: (a, b) => (b.signals?.lastActiveAt ?? '').localeCompare(a.signals?.lastActiveAt ?? '') || byName(a, b),
  },
  testDate: {
    label: 'Test date (soonest)',
    cmp: (a, b) => (a.signals?.testDate ?? '9999').localeCompare(b.signals?.testDate ?? '9999') || byName(a, b),
  },
  goalGap: {
    label: 'Goal gap (largest)',
    cmp: (a, b) => {
      const ga = goalGap(a);
      const gb = goalGap(b);
      return last(ga == null ? null : -ga) - last(gb == null ? null : -gb) || byName(a, b);
    },
  },
  plan: {
    label: 'Plan (behind first)',
    cmp: (a, b) => planUrgency(a) - planUrgency(b) || (b.plan?.overdueCount ?? 0) - (a.plan?.overdueCount ?? 0) || byName(a, b),
  },
};

const FOUNDATIONS_SORT: Sort = {
  label: 'Foundations (fewest covered)',
  cmp: (a, b) => (a.foundations?.covered ?? 0) - (b.foundations?.covered ?? 0) || byName(a, b),
};

const ACTIVE_SORTS_WITH_FOUNDATIONS: Record<string, Sort> = { ...ACTIVE_SORTS, foundations: FOUNDATIONS_SORT };

const ARCHIVED_SORTS: Record<string, Sort> = {
  name: { label: 'Name (A–Z)', cmp: byName },
  impactDesc: { label: 'Impact (high → low)', cmp: (a, b) => (b.archive?.impact ?? -Infinity) - (a.archive?.impact ?? -Infinity) },
  finalDesc: { label: 'Final (high → low)', cmp: (a, b) => (b.archive?.finalScore ?? -Infinity) - (a.archive?.finalScore ?? -Infinity) },
  reachDesc: { label: 'Target reach (high → low)', cmp: (a, b) => (b.archive?.targetReachPct ?? -Infinity) - (a.archive?.targetReachPct ?? -Infinity) },
};

function goalGap(st: RosterStudent): number | null {
  const score = st.signals?.latestScore;
  return score != null && st.targetScore != null ? st.targetScore - score : null;
}

function nameOf(st: RosterStudent): string {
  return [st.firstName, st.lastName].filter(Boolean).join(' ') || st.email || '—';
}

export function RosterInteractive({ students, canEdit, showFoundations = false, nowMs }: {
  students: RosterStudent[];
  canEdit: boolean;
  showFoundations?: boolean;
  nowMs: number;
}) {
  const [query, setQuery] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [activeSort, setActiveSort] = useState('attention');
  const [archivedSort, setArchivedSort] = useState('name');
  const [editing, setEditing] = useState<RosterStudent | null>(null);

  const sorts = showPast
    ? ARCHIVED_SORTS
    : showFoundations ? ACTIVE_SORTS_WITH_FOUNDATIONS : ACTIVE_SORTS;
  const sort = showPast ? archivedSort : activeSort;
  const activeCount = students.filter((st) => st.isActive).length;
  const pastCount = students.length - activeCount;
  const term = query.trim().toLowerCase();

  const view = useMemo(() => {
    const rows = students
      .filter((st) => st.isActive !== showPast)
      .filter((st) => !term || [st.firstName, st.lastName, st.email, st.highSchool]
        .filter(Boolean).join(' ').toLowerCase().includes(term));
    return rows.sort((sorts[sort] ?? sorts.name).cmp);
  }, [students, showPast, term, sort, sorts]);

  return (
    <>
      <div className={s.toolbar}>
        <label className={s.srOnly} htmlFor="roster-search">Search students</label>
        <input
          id="roster-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or school…"
          className={s.search}
        />
        <div className={s.segmented} role="group" aria-label="Which students">
          <button type="button" aria-pressed={!showPast} onClick={() => setShowPast(false)}>Active · {activeCount}</button>
          <button type="button" aria-pressed={showPast} onClick={() => setShowPast(true)}>Past · {pastCount}</button>
        </div>
        <label className={s.sortLabel}>
          Sort
          <select
            value={sort}
            onChange={(e) => (showPast ? setArchivedSort(e.target.value) : setActiveSort(e.target.value))}
            className={s.select}
          >
            {Object.entries(sorts).map(([key, def]) => (
              <option key={key} value={key}>{def.label}</option>
            ))}
          </select>
        </label>
        {term && <span className={s.count} role="status">{view.length} match{view.length === 1 ? '' : 'es'}</span>}
      </div>

      {view.length === 0 ? (
        <div className={s.empty}>
          {term
            ? 'No students match that search.'
            : showPast
              ? 'No past students yet. Archive a student from the ⋯ menu to move them here.'
              : 'No active students on your roster.'}
        </div>
      ) : showPast ? (
        <ArchivedTable students={view} canEdit={canEdit} />
      ) : (
        <ActiveTable students={view} canEdit={canEdit} onEdit={setEditing} showFoundations={showFoundations} nowMs={nowMs} />
      )}

      {editing && <QuickEditModal student={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

// ──────────────────────────────────────────────────────────────

function ActiveTable({ students, canEdit, onEdit, showFoundations, nowMs }: {
  students: RosterStudent[];
  canEdit: boolean;
  onEdit: (st: RosterStudent) => void;
  showFoundations: boolean;
  nowMs: number;
}) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.th} scope="col">Student</th>
            <th className={s.th} scope="col">Last active</th>
            <th className={s.th} scope="col">Plan</th>
            <th className={s.thNum} scope="col">Score / goal</th>
            <th className={s.th} scope="col">Test</th>
            <th className={s.th} scope="col">Assignments</th>
            {showFoundations && <th className={s.th} scope="col">Foundations</th>}
            <th className={s.thAction} scope="col"><span className={s.srOnly}>Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {students.map((st) => (
            <tr key={st.id} className={s.row}>
              <td className={s.td}>
                <Link href={`/tutor/students/${st.id}`} className={s.nameLink}>{nameOf(st)}</Link>
                <div className={s.subline}>
                  {[st.highSchool, st.graduationYear].filter(Boolean).join(' · ') || st.email || '—'}
                </div>
                {st.access && (
                  <span
                    className={st.access.tone === 'warn' ? s.accessWarn : s.accessInfo}
                    title={st.access.title}
                  >
                    {st.access.label}
                  </span>
                )}
              </td>
              <td className={`${s.td} ${s.nowrap}`}><LastActive at={st.signals?.lastActiveAt ?? null} known={st.signals != null} nowMs={nowMs} /></td>
              <td className={s.td}><PlanCell st={st} /></td>
              <td className={`${s.tdNum} ${s.nowrap}`}>
                <strong>{st.signals?.latestScore ?? '—'}</strong>
                <span className={s.muted}> / {st.targetScore ?? '—'}</span>
              </td>
              <td className={`${s.td} ${s.nowrap}`}><TestCell date={st.signals?.testDate ?? null} nowMs={nowMs} /></td>
              <td className={`${s.td} ${s.nowrap}`}><AssignmentsCell signals={st.signals ?? null} /></td>
              {showFoundations && (
                <td className={s.td}>
                  {st.foundations
                    ? <FoundationsChip studentId={st.id} summary={st.foundations} />
                    : <span className={s.muted}>—</span>}
                </td>
              )}
              <td className={s.tdAction}>
                <div className={s.actionRow}>
                  <Link href={`/tutor/session/${st.id}`} className={s.sessionBtn}>Session</Link>
                  <RowMenu student={st} canEdit={canEdit} onEdit={onEdit} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LastActive({ at, known, nowMs }: { at: string | null; known: boolean; nowMs: number }) {
  if (!known) return <span className={s.muted}>—</span>;
  const days = daysSince(at, nowMs);
  if (days == null) return <span className={s.warn}>{ACTIVITY_LOOKBACK_DAYS}+ days</span>;
  if (days >= IDLE_DAYS) return <span className={s.warn}>{days} days</span>;
  return <>{formatRelativeShort(at)}</>;
}

function PlanCell({ st }: { st: RosterStudent }) {
  return (
    <>
      {st.plan && (
        <Link
          href={`/tutor/students/${st.id}/plan`}
          className={`${s.planChip} ${s[`plan_${st.plan.status}`] ?? ''}`}
          title={st.plan.line}
        >
          {st.plan.status === 'behind' && st.plan.overdueCount > 0 ? `${st.plan.overdueCount} overdue` : st.plan.label}
        </Link>
      )}
      {st.hasPlanDraft && (
        <Link href={`/tutor/students/${st.id}/plan`} className={`${s.planChip} ${s.planDraft}`} title="A draft plan is waiting for your review">
          Review draft
        </Link>
      )}
      {!st.plan && !st.hasPlanDraft && <span className={s.muted}>No plan</span>}
    </>
  );
}

function TestCell({ date, nowMs }: { date: string | null; nowMs: number }) {
  if (!date) return <span className={s.muted}>Not set</span>;
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const until = daysUntil(date, nowMs);
  if (until == null) return <span className={s.muted}>Not set</span>;
  if (until < 0) return <span className={s.muted}>{label} (past)</span>;
  return <>{label} <span className={s.muted}>· {until === 0 ? 'today' : `${until}d`}</span></>;
}

function AssignmentsCell({ signals }: { signals: StudentSignals | null }) {
  if (!signals) return <span className={s.muted}>—</span>;
  if (signals.overdueAssignments > 0) return <span className={s.alert}>{signals.overdueAssignments} overdue</span>;
  if (signals.openAssignments > 0) return <>{signals.openAssignments} open</>;
  return <span className={s.muted}>—</span>;
}

// ── Row menu ──────────────────────────────────────────────────

function RowMenu({ student, canEdit, onEdit }: {
  student: RosterStudent;
  canEdit: boolean;
  onEdit: (st: RosterStudent) => void;
}) {
  const [open, setOpen] = useState(false);
  // The table scrolls sideways (overflow: auto), which would clip an
  // absolutely positioned menu, so the menu is fixed to the viewport
  // under its button and closes on scroll or resize.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const name = nameOf(student);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  function toggle() {
    if (open) { setOpen(false); return; }
    const r = button.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    setOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); button.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  }

  async function onArchive() {
    setOpen(false);
    const ok = await confirm({
      title: `Archive ${name}?`,
      body: 'They move to Past with their starting and final score summary. You can restore them any time.',
      confirmLabel: 'Archive student',
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await updateStudentProfile({ studentId: student.id, patch: { is_active: false } });
      if (res?.ok) router.refresh();
    });
  }

  return (
    <div className={s.menuWrap} ref={wrap}>
      <button
        ref={button}
        type="button"
        className={s.menuBtn}
        aria-label={`More actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={toggle}
      >
        {pending ? '…' : '⋯'}
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={`${name} actions`}
          className={s.menu}
          style={pos ? { top: pos.top, right: pos.right } : undefined}
          onKeyDown={onKeyDown}
        >
          <Link role="menuitem" href={`/tutor/assignments/new?student=${student.id}`} className={s.menuItem}>Assign work</Link>
          <Link role="menuitem" href={`/tutor/students/${student.id}/plan`} className={s.menuItem}>
            {student.plan || student.hasPlanDraft ? 'Open study plan' : 'Build study plan'}
          </Link>
          {canEdit && (
            <>
              <button role="menuitem" type="button" className={s.menuItem} onClick={() => { setOpen(false); onEdit(student); }}>
                Quick edit…
              </button>
              <div className={s.menuSep} role="separator" />
              <button role="menuitem" type="button" className={`${s.menuItem} ${s.menuDanger}`} onClick={onArchive}>
                Archive student
              </button>
            </>
          )}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────

function ArchivedTable({ students, canEdit }: { students: RosterStudent[]; canEdit: boolean }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.th} scope="col">Name</th>
            <th className={s.thNum} scope="col">Starting</th>
            <th className={s.thNum} scope="col">Final</th>
            <th className={s.thNum} scope="col">Impact</th>
            <th className={s.thNum} scope="col">Target</th>
            <th className={s.thNum} scope="col">Reach</th>
            <th className={s.thAction} scope="col"><span className={s.srOnly}>Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {students.map((st) => {
            const a = st.archive ?? {};
            return (
              <tr key={st.id} className={`${s.row} ${s.rowInactive}`}>
                <td className={s.td}>
                  <Link href={`/tutor/students/${st.id}`} className={s.nameLink}>{nameOf(st)}</Link>
                </td>
                <td className={s.tdNum}>{a.startingScore ?? '—'}</td>
                <td className={s.tdNum}>{a.finalScore ?? '—'}</td>
                <td className={s.tdNum}>
                  {a.impact == null ? '—' : (
                    <span className={a.impact > 0 ? s.impactPositive : a.impact < 0 ? s.impactNegative : s.muted}>
                      {a.impact > 0 ? '+' : ''}{a.impact}
                    </span>
                  )}
                </td>
                <td className={s.tdNum}>{st.targetScore ?? '—'}</td>
                <td className={s.tdNum}>
                  {a.targetReachPct == null ? '—' : (
                    <span className={reachTone(a.targetReachPct)}>{a.targetReachPct}%</span>
                  )}
                </td>
                <td className={s.tdAction}>{canEdit && <RestoreButton studentId={st.id} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FoundationsChip({ studentId, summary }: { studentId: string; summary: FoundationsSummary }) {
  const { covered, total } = summary;
  const done = total > 0 && covered >= total;
  const tone = done ? s.foundations_done : covered > 0 ? s.foundations_partial : s.foundations_none;
  return (
    <Link
      href={`/tutor/students/${studentId}#foundations`}
      className={`${s.planChip} ${tone}`}
      title={`${covered} of ${total} foundation lesson${total === 1 ? '' : 's'} completed or covered in session — open the student to mark what you covered live`}
    >
      {done ? 'Covered' : `${covered} of ${total}`}
    </Link>
  );
}

function RestoreButton({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={s.restoreBtn}
      disabled={pending}
      onClick={() => startTransition(async () => {
        const res = await updateStudentProfile({ studentId, patch: { is_active: true } });
        if (res?.ok) router.refresh();
      })}
    >
      {pending ? '…' : 'Restore'}
    </button>
  );
}

function reachTone(pct: number): string {
  if (pct >= 100) return s.reachHit;
  if (pct >= 90) return s.reachClose;
  if (pct >= 75) return s.reachMid;
  return s.reachLow;
}
