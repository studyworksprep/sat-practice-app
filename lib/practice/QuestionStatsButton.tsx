// Manager/admin per-question "Stats" button + modal.
//
// Shows how students have actually done on ONE question: first-attempt
// accuracy, the answer distribution (which distractor pulls), timing,
// performance by context (practice / assignment / timed test), retry
// recovery, item discrimination, how the item compares to its skill
// peers, where it's placed, and a few count-only signals.
//
// Nothing is loaded with the page. The payload is fetched via
// loadQuestionStatsAction the moment the button is clicked (the
// BrokenButton `lazy` pattern), cached in state for the life of the
// page, and re-fetchable from the modal header.
//
// Two cuts render side by side when they differ: "All students"
// (bank-wide, SECURITY DEFINER) and "Your students" (the viewer's
// roster under RLS). Admins get a single column.
//
// Built on the native <dialog> like lib/ui/ConfirmDialog — focus
// trap, Escape, ::backdrop and top-layer stacking come free.

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import { loadQuestionStatsAction } from './question-stats-actions';
import type { QuestionStats, QuestionStatsCut } from './question-stats';
import s from './QuestionStatsButton.module.css';

export interface QuestionStatsButtonProps {
  questionId: string;
  /** Render nothing unless true — the page decides (manager/admin). */
  canView?: boolean;
  /** MCQ option labels in display order (A, B, C, D) so the
   *  distribution shows zero-count options too. */
  optionLabels?: string[];
  displayCode?: string | null;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; stats: QuestionStats };

export function QuestionStatsButton({
  questionId,
  canView = false,
  optionLabels = [],
  displayCode = null,
}: QuestionStatsButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [, startTransition] = useTransition();

  if (!canView) return null;

  function fetchStats() {
    setState({ status: 'loading' });
    startTransition(async () => {
      const res = await loadQuestionStatsAction({ questionId });
      if (!res.ok) {
        setState({ status: 'error', message: res.error ?? 'Could not load statistics.' });
        return;
      }
      setState({ status: 'ready', stats: res.data });
    });
  }

  function handleOpen() {
    setOpen(true);
    if (state.status === 'idle' || state.status === 'error') fetchStats();
  }

  return (
    <>
      <button
        type="button"
        className={s.iconBtn}
        onClick={handleOpen}
        title="Question statistics"
        aria-label="Open question statistics"
        aria-haspopup="dialog"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
          <path
            d="M4 20h16M7 16V10M12 16V5M17 16v-3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Stats</span>
      </button>

      {open && (
        <StatsDialog
          state={state}
          displayCode={displayCode}
          optionLabels={optionLabels}
          onRefresh={fetchStats}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Dialog shell
// ──────────────────────────────────────────────────────────────

function StatsDialog({
  state,
  displayCode,
  optionLabels,
  onRefresh,
  onClose,
}: {
  state: LoadState;
  displayCode: string | null;
  optionLabels: string[];
  onRefresh: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const stats = state.status === 'ready' ? state.stats : null;
  const loading = state.status === 'loading';

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="sw-qstats-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={s.inner}>
        <header className={s.header}>
          <div>
            <h2 id="sw-qstats-title" className={s.title}>Question statistics</h2>
            <div className={s.subtitle}>
              {displayCode && <><code className={s.mono}>{displayCode}</code> · </>}
              {stats ? (
                <>
                  {stats.question_type.toUpperCase()}
                  {stats.key_label && <> · key <strong>{stats.key_label}</strong></>}
                  {stats.difficulty != null && <> · difficulty {stats.difficulty}</>}
                  {stats.score_band != null && <> · band {stats.score_band}</>}
                  <> · as of {fmtTime(stats.computed_at)}</>
                </>
              ) : loading ? 'Loading…' : null}
            </div>
          </div>
          <div className={s.headerActions}>
            <button
              type="button"
              className={s.btnSecondary}
              onClick={onRefresh}
              disabled={loading}
              title="Recompute from the latest attempts"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button type="button" className={s.closeBtn} onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div className={s.body}>
          {state.status === 'error' && (
            <div className={s.error} role="alert">{state.message}</div>
          )}
          {loading && !stats && <div className={s.muted}>Computing statistics…</div>}
          {stats && <StatsBody stats={stats} optionLabels={optionLabels} />}
        </div>
      </div>
    </dialog>
  );
}

// ──────────────────────────────────────────────────────────────
// Body
// ──────────────────────────────────────────────────────────────

const CONTEXT_LABELS: Record<string, string> = {
  practice: 'Free practice',
  assignment: 'Assignments',
  test: 'Timed tests',
  review: 'Review',
  training: 'Tutor training',
  lesson: 'Lessons',
};

function StatsBody({ stats, optionLabels }: { stats: QuestionStats; optionLabels: string[] }) {
  const all = stats.all;
  const roster = stats.roster;
  const hasRoster = roster != null;

  if (all.n_students === 0) {
    return <div className={s.empty}>No student has attempted this question yet.</div>;
  }

  const thin = all.n_students < 5;

  return (
    <>
      {thin && (
        <div className={s.note}>
          Only {all.n_students} {plural(all.n_students, 'student has', 'students have')} attempted
          this question — treat the percentages as indicative, not representative.
        </div>
      )}

      <ItemFlags stats={stats} />

      <Section title="Overview" hint="First attempt = each student's earliest attempt. A blank response counts as incorrect.">
        <CutTable
          hasRoster={hasRoster}
          rows={[
            ['Students', (c) => fmtInt(c.n_students)],
            ['First-attempt accuracy', (c) => pctWithN(c.first.correct, c.first.n)],
            ['All-attempt accuracy', (c) => pctWithN(c.all.correct, c.all.n)],
            ['No response recorded', (c) => fmtInt(c.first.no_response)],
            ['First · last attempt', (c) => dateRange(c.first_attempt_at, c.last_attempt_at)],
          ]}
          all={all}
          roster={roster}
        />
      </Section>

      <Section
        title={stats.question_type === 'spr' ? 'Responses' : 'Answer distribution'}
        hint="First attempts with a recorded response."
      >
        <Distribution stats={stats} optionLabels={optionLabels} />
      </Section>

      <Section title="Timing" hint="First attempts with a recorded time between 0 and 30 min.">
        <CutTable
          hasRoster={hasRoster}
          rows={[
            ['Median time', (c) => fmtMs(c.timing.median_ms)],
            ['Middle half (p25–p75)', (c) =>
              c.timing.p25_ms != null && c.timing.p75_ms != null
                ? `${fmtMs(c.timing.p25_ms)} – ${fmtMs(c.timing.p75_ms)}`
                : '—'],
            ['Median when correct', (c) => fmtMs(c.timing.median_correct_ms)],
            ['Median when wrong', (c) => fmtMs(c.timing.median_wrong_ms)],
            ['Timed attempts', (c) => fmtInt(c.timing.n_timed)],
          ]}
          all={all}
          roster={roster}
        />
      </Section>

      <Section title="By context" hint="First-attempt accuracy by where the student met the question.">
        <ContextTable all={all} roster={roster} />
      </Section>

      <Section title="Retries & flags">
        <CutTable
          hasRoster={hasRoster}
          rows={[
            ['Students who retried', (c) => fmtInt(c.retry.students_retried)],
            ['Wrong first → later correct', (c) =>
              c.retry.wrong_first > 0
                ? `${c.retry.recovered} of ${c.retry.wrong_first} (${pct(c.retry.recovered, c.retry.wrong_first)})`
                : '—'],
            ['Marked for review (tests)', (c) =>
              c.marked_for_review.items > 0
                ? `${c.marked_for_review.flagged} of ${c.marked_for_review.items} (${pct(c.marked_for_review.flagged, c.marked_for_review.items)})`
                : '—'],
          ]}
          all={all}
          roster={roster}
        />
      </Section>

      <Section title="Item quality" hint="Bank-wide, first attempts.">
        <ItemQuality stats={stats} />
      </Section>

      <Section title="Where it appears">
        <Placements stats={stats} />
      </Section>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Sections
// ──────────────────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h3 className={s.sectionTitle}>{title}</h3>
        {hint && <span className={s.sectionHint}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}

type RowSpec = [label: string, render: (c: QuestionStatsCut) => ReactNode];

function CutTable({
  rows,
  all,
  roster,
  hasRoster,
}: {
  rows: RowSpec[];
  all: QuestionStatsCut;
  roster: QuestionStatsCut | null;
  hasRoster: boolean;
}) {
  return (
    <table className={s.table}>
      <thead>
        <tr>
          <th scope="col" className={s.thLabel}><span className={s.srOnly}>Metric</span></th>
          <th scope="col">All students</th>
          {hasRoster && <th scope="col">Your students</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, render]) => (
          <tr key={label}>
            <th scope="row" className={s.thLabel}>{label}</th>
            <td>{render(all)}</td>
            {hasRoster && roster && <td>{render(roster)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Distribution({ stats, optionLabels }: { stats: QuestionStats; optionLabels: string[] }) {
  const all = stats.all;
  const roster = stats.roster;
  const isSpr = stats.question_type === 'spr';

  const allByResp = new Map(all.distribution.map((d) => [d.response, d]));
  const rosterByResp = new Map((roster?.distribution ?? []).map((d) => [d.response, d]));

  // MCQ: fixed option order, zero-filled, plus any stray values.
  // SPR: top responses by count, as returned.
  let order: string[];
  if (isSpr) {
    order = all.distribution.map((d) => d.response);
  } else {
    const labels = optionLabels.length > 0 ? optionLabels : ['A', 'B', 'C', 'D'];
    const strays = all.distribution.map((d) => d.response).filter((r) => !labels.includes(r));
    order = [...labels, ...strays];
  }

  const allAnswered = all.first.n - all.first.no_response;
  const rosterAnswered = roster ? roster.first.n - roster.first.no_response : 0;
  const maxCount = Math.max(1, ...all.distribution.map((d) => d.count));

  return (
    <div>
      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col" className={s.thLabel}>{isSpr ? 'Response' : 'Option'}</th>
            <th scope="col" className={s.thBar}>All students</th>
            <th scope="col" className={s.thNum}>n</th>
            {roster && <th scope="col" className={s.thNum}>Your students</th>}
          </tr>
        </thead>
        <tbody>
          {order.map((resp) => {
            const a = allByResp.get(resp);
            const r = rosterByResp.get(resp);
            const count = a?.count ?? 0;
            const isKey = isSpr
              ? (a?.correct ?? 0) > 0 && (a?.correct ?? 0) === count
              : stats.key_label != null && resp === stats.key_label;
            const mixed = a != null && a.correct > 0 && a.correct < a.count;
            return (
              <tr key={resp} className={isKey ? s.rowKey : undefined}>
                <th scope="row" className={s.thLabel}>
                  <span className={s.respLabel}>{resp}</span>
                  {isKey && <span className={s.keyBadge} title="Correct answer">✓</span>}
                  {mixed && (
                    <span
                      className={s.mixedBadge}
                      title={`${a.correct} of ${a.count} graded correct — the key may have changed under existing attempts`}
                    >
                      mixed
                    </span>
                  )}
                </th>
                <td className={s.tdBar}>
                  <div className={s.bar} aria-hidden="true">
                    <div
                      className={isKey ? s.barFillKey : s.barFill}
                      style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                    />
                  </div>
                </td>
                <td className={s.tdNum}>
                  {fmtInt(count)} <span className={s.muted}>({pct(count, allAnswered)})</span>
                </td>
                {roster && (
                  <td className={s.tdNum}>
                    {fmtInt(r?.count ?? 0)}{' '}
                    <span className={s.muted}>({pct(r?.count ?? 0, rosterAnswered)})</span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {(all.first.no_response > 0 || (roster?.first.no_response ?? 0) > 0) && (
        <div className={s.footnote}>
          No response recorded: {fmtInt(all.first.no_response)}
          {roster && <> (your students: {fmtInt(roster.first.no_response)})</>} — counted as
          incorrect in accuracy, excluded from the percentages above.
        </div>
      )}
    </div>
  );
}

function ContextTable({ all, roster }: { all: QuestionStatsCut; roster: QuestionStatsCut | null }) {
  const contexts = Array.from(
    new Set([...all.by_context, ...(roster?.by_context ?? [])].map((c) => c.context)),
  );
  const allBy = new Map(all.by_context.map((c) => [c.context, c]));
  const rosterBy = new Map((roster?.by_context ?? []).map((c) => [c.context, c]));
  if (contexts.length === 0) return <div className={s.muted}>—</div>;
  return (
    <table className={s.table}>
      <thead>
        <tr>
          <th scope="col" className={s.thLabel}><span className={s.srOnly}>Context</span></th>
          <th scope="col">All students</th>
          {roster && <th scope="col">Your students</th>}
        </tr>
      </thead>
      <tbody>
        {contexts.map((ctx) => {
          const a = allBy.get(ctx);
          const r = rosterBy.get(ctx);
          return (
            <tr key={ctx}>
              <th scope="row" className={s.thLabel}>{CONTEXT_LABELS[ctx] ?? ctx}</th>
              <td>{a ? pctWithN(a.correct, a.n) : '—'}</td>
              {roster && <td>{r ? pctWithN(r.correct, r.n) : '—'}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ItemQuality({ stats }: { stats: QuestionStats }) {
  const all = stats.all;
  const itemAcc = ratio(all.first.correct, all.first.n);
  const disc = stats.discrimination;
  const sb = stats.skill_baseline;
  const sdb = stats.skill_difficulty_baseline;

  return (
    <dl className={s.dl}>
      <div className={s.dlRow}>
        <dt>Discrimination</dt>
        <dd>
          {disc.r == null || disc.n < 10 ? (
            <span className={s.muted}>
              — {disc.n < 10 ? `needs ≥ 10 students with history (have ${disc.n})` : 'undefined'}
            </span>
          ) : (
            <>
              <strong>{disc.r.toFixed(2)}</strong>{' '}
              <span className={s.muted}>
                · {discriminationLabel(disc.r)} · n = {disc.n}
                {disc.n < 20 && ' · low confidence'}
              </span>
            </>
          )}
        </dd>
      </div>
      <div className={s.dlRow}>
        <dt>This question</dt>
        <dd>
          <strong>{pct(all.first.correct, all.first.n)}</strong>{' '}
          <span className={s.muted}>first-attempt accuracy · n = {all.first.n}</span>
        </dd>
      </div>
      <div className={s.dlRow}>
        <dt>Other {stats.skill_name ? `“${stats.skill_name}”` : 'same-skill'} questions</dt>
        <dd>
          {sb ? (
            <>
              <strong>{pct(sb.correct, sb.n)}</strong>{' '}
              <span className={s.muted}>
                · {fmtInt(sb.n_questions)} questions, {fmtInt(sb.n)} first attempts
                {itemAcc != null && <> · {deltaLabel(itemAcc, ratio(sb.correct, sb.n))}</>}
              </span>
            </>
          ) : (
            <span className={s.muted}>—</span>
          )}
        </dd>
      </div>
      <div className={s.dlRow}>
        <dt>
          Same skill, difficulty {stats.difficulty ?? '—'}
        </dt>
        <dd>
          {sdb ? (
            <>
              <strong>{pct(sdb.correct, sdb.n)}</strong>{' '}
              <span className={s.muted}>
                · {fmtInt(sdb.n_questions)} questions, {fmtInt(sdb.n)} first attempts
                {itemAcc != null && <> · {deltaLabel(itemAcc, ratio(sdb.correct, sdb.n))}</>}
              </span>
            </>
          ) : (
            <span className={s.muted}>—</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

function Placements({ stats }: { stats: QuestionStats }) {
  const sig = stats.signals;
  return (
    <dl className={s.dl}>
      <div className={s.dlRow}>
        <dt>Practice tests</dt>
        <dd>
          {stats.placements.length === 0 ? (
            <span className={s.muted}>not in any test</span>
          ) : (
            <ul className={s.list}>
              {stats.placements.map((p, i) => (
                <li key={i}>
                  {p.test_name}
                  <span className={s.muted}>
                    {' '}· {p.subject_code} · module {p.module_number}
                    {p.route_code && p.route_code !== 'std' && ` (${p.route_code})`} · #{p.ordinal}
                    {!p.is_published && ' · unpublished'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </div>
      <div className={s.dlRow}>
        <dt>Assignments</dt>
        <dd>{fmtInt(sig.assignments)} <span className={s.muted}>containing this question</span></dd>
      </div>
      <div className={s.dlRow}>
        <dt>Student signals</dt>
        <dd>
          {fmtInt(sig.error_notes)} error-log {plural(sig.error_notes, 'entry', 'entries')}
          {' · '}
          {fmtInt(sig.student_notes)} student {plural(sig.student_notes, 'note', 'notes')}
        </dd>
      </div>
      <div className={s.dlRow}>
        <dt>Staff artifacts</dt>
        <dd>
          {fmtInt(sig.question_notes)} staff {plural(sig.question_notes, 'note', 'notes')}
          {' · '}
          {sig.desmos_states > 0 ? 'Desmos state saved' : 'no Desmos state'}
        </dd>
      </div>
    </dl>
  );
}

/** Advisory flags — the mis-key / calibration signatures item_miskey_audit
 *  uses, shown inline so the tutor sees them without leaving the page. */
function ItemFlags({ stats }: { stats: QuestionStats }) {
  const all = stats.all;
  const n = all.first.n;
  if (n < 5) return null;
  const acc = ratio(all.first.correct, n);
  const flags: string[] = [];

  if (stats.question_type !== 'spr' && stats.key_label) {
    const modal = [...all.distribution].sort((a, b) => b.count - a.count)[0];
    if (modal && modal.response !== stats.key_label && acc != null && acc < 0.5) {
      flags.push(
        `Students pick ${modal.response} more often than the key (${stats.key_label}) — check the answer key or the wording.`,
      );
    }
  }
  if (acc != null && acc <= 0.15) {
    flags.push('Almost nobody gets this right — a mis-key or a genuinely broken item is likely.');
  }
  if (stats.discrimination.r != null && stats.discrimination.n >= 10 && stats.discrimination.r < -0.15) {
    flags.push('Negative discrimination: stronger students do worse on this item than weaker ones.');
  }
  if (acc != null && stats.difficulty === 3 && acc >= 0.85) {
    flags.push('Labelled hard, but most students get it right — the difficulty label may be high.');
  }
  if (acc != null && stats.difficulty === 1 && acc <= 0.4) {
    flags.push('Labelled easy, but most students miss it — the difficulty label may be low.');
  }

  if (flags.length === 0) return null;
  return (
    <div className={s.flags} role="status">
      {flags.map((f) => <div key={f}>⚑ {f}</div>)}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Formatting helpers
// ──────────────────────────────────────────────────────────────

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

function pct(num: number, den: number): string {
  const r = ratio(num, den);
  return r == null ? '—' : `${Math.round(r * 100)}%`;
}

function pctWithN(num: number, den: number): ReactNode {
  if (den <= 0) return '—';
  return (
    <>
      <strong>{pct(num, den)}</strong> <span className={s.muted}>({num}/{den})</span>
    </>
  );
}

function fmtInt(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateRange(a: string | null, b: string | null): string {
  if (!a && !b) return '—';
  const fa = fmtDate(a);
  const fb = fmtDate(b);
  return fa === fb ? fa : `${fa} → ${fb}`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function discriminationLabel(r: number): string {
  if (r < 0) return 'negative — check the key';
  if (r < 0.15) return 'weak';
  if (r < 0.3) return 'fair';
  return 'good';
}

function deltaLabel(item: number, baseline: number | null): string {
  if (baseline == null) return '';
  const d = Math.round((item - baseline) * 100);
  if (Math.abs(d) < 3) return 'about the same';
  return d > 0 ? `${d} pts easier than peers` : `${Math.abs(d)} pts harder than peers`;
}
