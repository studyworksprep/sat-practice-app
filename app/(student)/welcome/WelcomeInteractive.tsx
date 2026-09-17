// Client islands for the onboarding intake (docs/student-onboarding-and-
// plan-redesign-2026-09.md §3). One question per screen: each island is
// a small form wired to a route-local Server Action via useActionState;
// step progression is server-derived (page.tsx re-renders after each
// action revalidates the route), so these islands hold no wizard state
// — except SelfCheck, which walks the eight domains locally and submits
// them all at once.

'use client';

import { useActionState, useState } from 'react';
import type { ActionResult } from '@/lib/types';
import type { PrepLevel, Intent, SatDomainCode, SelfRatingValue } from '@/lib/plan/intake';
import type { SatDomain } from '@/lib/practice/sat-taxonomy';
import s from './Welcome.module.css';

type WizardAction = (
  prev: ActionResult | null,
  fd: FormData,
) => Promise<ActionResult | null>;

function ErrorNote({ state }: { state: ActionResult | null }) {
  if (!state || state.ok) return null;
  return <p className={s.error} role="alert">{state.error}</p>;
}

function SubmitRow({
  pending,
  label,
  pendingLabel,
  state,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
  state: ActionResult | null;
}) {
  return (
    <div className={s.actionsRow}>
      <button className={s.primaryBtn} type="submit" disabled={pending}>
        {pending ? pendingLabel : label}
      </button>
      <ErrorNote state={state} />
    </div>
  );
}

// ── Single-answer questions ───────────────────────────────────────

export function TargetForm({ action, defaultValue }: { action: WizardAction; defaultValue: number | '' }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={s.form}>
      <input type="hidden" name="question" value="target" />
      <label className={s.field}>
        <span className={s.label}>Target score</span>
        <input
          className={`${s.input} ${s.inputBig}`}
          name="target"
          type="number"
          min={400}
          max={1600}
          step={10}
          required
          autoFocus
          defaultValue={defaultValue}
          placeholder="1400"
        />
      </label>
      <p className={s.hint}>Most students aim 100–200 points above their current score.</p>
      <SubmitRow pending={pending} label="Next" pendingLabel="Saving…" state={state} />
    </form>
  );
}

export function TestDateForm({ action, defaultValue }: { action: WizardAction; defaultValue: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={s.form}>
      <input type="hidden" name="question" value="test_date" />
      <label className={s.field}>
        <span className={s.label}>Test date</span>
        <input className={`${s.input} ${s.inputBig}`} name="testDate" type="date" required autoFocus defaultValue={defaultValue} />
      </label>
      <SubmitRow pending={pending} label="Next" pendingLabel="Saving…" state={state} />
    </form>
  );
}

const PREP_OPTIONS: { value: PrepLevel; title: string; sub: string }[] = [
  { value: 'none', title: "I'm just getting started", sub: 'Little or no SAT prep so far — and that is completely fine.' },
  { value: 'some', title: "I've done some studying", sub: 'A class, some practice on my own, or a test or two.' },
  { value: 'a_lot', title: "I've prepped seriously", sub: 'Tutoring or a lot of practice. I mostly want to sharpen weak areas.' },
];

export function PrepForm({ action, defaultValue }: { action: WizardAction; defaultValue: PrepLevel | null }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={s.form}>
      <input type="hidden" name="question" value="prep" />
      <div className={s.choiceStack}>
        {PREP_OPTIONS.map((o) => (
          <label key={o.value} className={s.choice}>
            <input type="radio" name="prepLevel" value={o.value} required defaultChecked={defaultValue === o.value} />
            <span className={s.choiceBody}>
              <span className={s.choiceTitle}>{o.title}</span>
              <span className={s.choiceSub}>{o.sub}</span>
            </span>
          </label>
        ))}
      </div>
      <SubmitRow pending={pending} label="Next" pendingLabel="Saving…" state={state} />
    </form>
  );
}

const INTENT_OPTIONS: { value: Intent; title: string; sub: string }[] = [
  { value: 'guide_me', title: 'Guide me', sub: 'Build the plan around what you know about me. I will follow it day by day.' },
  { value: 'own_targets', title: 'I know what I need', sub: 'I will pick the skills. You put them on a schedule.' },
];

export function IntentForm({ action, defaultValue }: { action: WizardAction; defaultValue: Intent | null }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={s.form}>
      <input type="hidden" name="question" value="intent" />
      <div className={s.choiceStack}>
        {INTENT_OPTIONS.map((o) => (
          <label key={o.value} className={s.choice}>
            <input type="radio" name="intent" value={o.value} required defaultChecked={(defaultValue ?? 'guide_me') === o.value} />
            <span className={s.choiceBody}>
              <span className={s.choiceTitle}>{o.title}</span>
              <span className={s.choiceSub}>{o.sub}</span>
            </span>
          </label>
        ))}
      </div>
      <SubmitRow pending={pending} label="Next" pendingLabel="Saving…" state={state} />
    </form>
  );
}

const HOUR_OPTIONS = [2, 3, 5, 8, 10, 15];

export function HoursForm({ action, defaultValue }: { action: WizardAction; defaultValue: number }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const preset = HOUR_OPTIONS.includes(defaultValue) ? defaultValue : 5;
  return (
    <form action={formAction} className={s.form}>
      <input type="hidden" name="question" value="hours" />
      <div className={s.dayRow} role="radiogroup" aria-label="Hours per week">
        {HOUR_OPTIONS.map((h) => (
          <label key={h} className={s.dayChip}>
            <input type="radio" name="weeklyHours" value={h} defaultChecked={preset === h} />
            <span>{h} {h === 1 ? 'hour' : 'hours'}</span>
          </label>
        ))}
      </div>
      <p className={s.hint}>Roughly one task is 40 minutes, so 5 hours is about 7 or 8 tasks a week.</p>
      <SubmitRow pending={pending} label="Next" pendingLabel="Saving…" state={state} />
    </form>
  );
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DaysForm({ action, defaultValue }: { action: WizardAction; defaultValue: number[] }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const days = new Set(defaultValue);
  return (
    <form action={formAction} className={s.form}>
      <input type="hidden" name="question" value="days" />
      <div className={s.dayRow}>
        {DAY_LABELS.map((label, i) => (
          <label key={label} className={s.dayChip}>
            <input type="checkbox" name="day" value={i} defaultChecked={days.has(i)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <p className={s.hint}>Tasks only land on the days you pick, so the plan fits around your week.</p>
      <SubmitRow pending={pending} label="Next" pendingLabel="Saving…" state={state} />
    </form>
  );
}

// ── Targets ───────────────────────────────────────────────────────

export function TargetsForm({
  action,
  domains,
  examples,
  selected,
  fullTests,
}: {
  action: WizardAction;
  domains: SatDomain[];
  examples: Record<string, string>;
  selected: ReadonlySet<string>;
  fullTests: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const math = domains.filter((d) => d.subjectCode === 'math');
  const rw = domains.filter((d) => d.subjectCode === 'rw');

  const group = (title: string, list: SatDomain[]) => (
    <div className={s.skillColumn}>
      <div className={s.skillSection}>{title}</div>
      {list.map((d) => (
        <fieldset key={d.code} className={s.skillGroup}>
          <legend className={s.skillDomain} title={examples[d.code]}>
            {d.name}
            {examples[d.code] && <span className={s.skillExample}>{examples[d.code]}</span>}
          </legend>
          {d.skills.map((sk) => {
            const key = `${d.code}|${sk.code}`;
            return (
              <label key={key} className={s.skillRow}>
                <input type="checkbox" name="skill" value={key} defaultChecked={selected.has(key)} />
                <span>{sk.name}</span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );

  return (
    <form action={formAction} className={s.form}>
      <div className={s.skillColumns}>
        {group('Math', math)}
        {group('Reading & Writing', rw)}
      </div>
      <label className={s.checkRow}>
        <input type="checkbox" name="fullTests" defaultChecked={fullTests} />
        <span>Keep full-length practice tests on the schedule (every few weeks, then weekly near the test)</span>
      </label>
      <SubmitRow pending={pending} label="Next" pendingLabel="Saving…" state={state} />
    </form>
  );
}

// ── Self-check: one domain at a time ──────────────────────────────

export interface SelfCheckRow {
  code: SatDomainCode;
  name: string;
  section: string;
  example: string;
}

const RATING_OPTIONS: { value: string; label: string; sub?: string }[] = [
  { value: '1', label: '1', sub: 'Not comfortable' },
  { value: '2', label: '2' },
  { value: '3', label: '3', sub: 'So-so' },
  { value: '4', label: '4' },
  { value: '5', label: '5', sub: 'Very comfortable' },
];

export function SelfCheck({
  action,
  rows,
  defaults,
}: {
  action: WizardAction;
  rows: SelfCheckRow[];
  defaults: Partial<Record<SatDomainCode, SelfRatingValue>> | null;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  // 'unsure' | '1'..'5' per domain, filled as the student walks through.
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (defaults) {
      for (const r of rows) {
        if (Object.hasOwn(defaults, r.code)) {
          const v = defaults[r.code];
          init[r.code] = v == null ? 'unsure' : String(v);
        }
      }
    }
    return init;
  });
  const firstUnanswered = rows.findIndex((r) => !answers[r.code]);
  const [index, setIndex] = useState(firstUnanswered === -1 ? rows.length : firstUnanswered);

  const done = index >= rows.length;
  const row = done ? null : rows[index];

  function pick(value: string) {
    if (!row) return;
    setAnswers((a) => ({ ...a, [row.code]: value }));
    setIndex((i) => i + 1);
  }

  return (
    <form action={formAction} className={s.form}>
      {rows.map((r) => (
        <input key={r.code} type="hidden" name={`rating_${r.code}`} value={answers[r.code] ?? ''} />
      ))}

      {row ? (
        <div className={s.selfCheck} key={row.code}>
          <div className={s.selfCheckProgress}>
            {index + 1} of {rows.length}
            {index > 0 && (
              <button type="button" className={s.linkBtn} onClick={() => setIndex((i) => i - 1)}>
                ← Back
              </button>
            )}
          </div>
          <div className={s.selfCheckName}>{row.name}</div>
          <div className={s.selfCheckSection}>{row.section}</div>
          <p className={s.selfCheckExample}>{row.example}</p>
          <div className={s.ratingButtons} role="group" aria-label={`Comfort with ${row.name}`}>
            {RATING_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`${s.ratingBtn} ${answers[row.code] === o.value ? s.ratingBtnOn : ''}`}
                onClick={() => pick(o.value)}
                aria-label={o.sub ? `${o.label} — ${o.sub}` : o.label}
              >
                <span className={s.ratingBtnNum}>{o.label}</span>
                {o.sub && <span className={s.ratingBtnSub}>{o.sub}</span>}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`${s.unsureBtn} ${answers[row.code] === 'unsure' ? s.ratingBtnOn : ''}`}
            onClick={() => pick('unsure')}
          >
            I&rsquo;m not sure
          </button>
        </div>
      ) : (
        <div className={s.selfCheck}>
          <div className={s.selfCheckName}>That&rsquo;s everything.</div>
          <p className={s.selfCheckExample}>
            Ready to see your plan? It takes a few seconds to build.
          </p>
          <div className={s.actionsRow}>
            <button className={s.primaryBtn} type="submit" disabled={pending}>
              {pending ? 'Building your plan…' : 'Build my plan'}
            </button>
            <button type="button" className={s.linkBtn} onClick={() => setIndex(rows.length - 1)}>
              ← Back
            </button>
            <ErrorNote state={state} />
          </div>
        </div>
      )}
    </form>
  );
}

// ── Build / activate / set aside ──────────────────────────────────

export function BuildPlanButton({ action, label = 'Build my plan' }: { action: WizardAction; label?: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={s.inlineForm}>
      <button className={s.primaryBtn} type="submit" disabled={pending}>
        {pending ? 'Building your plan…' : label}
      </button>
      <ErrorNote state={state} />
    </form>
  );
}

export function RebuildPlanLink({ action }: { action: WizardAction }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={s.inlineForm}>
      <button className={s.linkBtn} type="submit" disabled={pending}>
        {pending ? 'Rebuilding…' : 'Rebuild the plan'}
      </button>
      <ErrorNote state={state} />
    </form>
  );
}

export function ActivateFirstPlanButton({ action, planId }: { action: WizardAction; planId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={s.inlineForm}>
      <input type="hidden" name="planId" value={planId} />
      <button className={s.primaryBtn} type="submit" disabled={pending}>
        {pending ? 'Starting…' : 'Start my plan'}
      </button>
      <ErrorNote state={state} />
    </form>
  );
}

export function SetAsideLink({ action }: { action: WizardAction }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={s.inlineForm}>
      <button className={s.skipBtn} type="submit" disabled={pending}>
        {pending ? 'One moment…' : "I'll do this later — take me to the dashboard"}
      </button>
      <ErrorNote state={state} />
    </form>
  );
}
