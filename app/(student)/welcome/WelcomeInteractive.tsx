// Client islands for the onboarding intake (docs/student-onboarding-and-
// plan-redesign-2026-09.md §3). One question per screen: each island is
// a small form wired to a route-local Server Action via useActionState;
// step progression is server-derived (page.tsx re-renders after each
// action revalidates the route), so these islands hold no wizard state.

'use client';

import { useActionState } from 'react';
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

// ── Welcome ───────────────────────────────────────────────────────

export function StartIntakeButton({ action }: { action: WizardAction }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={s.inlineForm}>
      <button className={s.primaryBtn} type="submit" disabled={pending}>
        {pending ? 'One moment…' : "Let's go"}
      </button>
      <ErrorNote state={state} />
    </form>
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
  { value: 'none', title: 'Just getting started', sub: 'Little or no SAT prep so far.' },
  { value: 'some', title: 'Some studying', sub: 'A class, some practice, or a test or two.' },
  { value: 'a_lot', title: 'Prepped seriously', sub: 'Tutoring or lots of practice — I want to sharpen weak areas.' },
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
  { value: 'guide_me', title: 'Guide me', sub: 'Build the plan around what you know about me.' },
  { value: 'own_targets', title: 'I know what I need', sub: 'I pick the skills; you schedule them.' },
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
            <span>{h} hrs</span>
          </label>
        ))}
      </div>
      <p className={s.hint}>One task is about 40 minutes.</p>
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
        <span>Keep full-length practice tests on the schedule</span>
      </label>
      <SubmitRow pending={pending} label="Next" pendingLabel="Saving…" state={state} />
    </form>
  );
}

// ── Self-check: one tile, eight rows ──────────────────────────────

export interface SelfCheckRow {
  code: SatDomainCode;
  name: string;
  section: string;
  example: string;
}

export function SelfCheckGrid({
  action,
  rows,
  defaults,
}: {
  action: WizardAction;
  rows: SelfCheckRow[];
  defaults: Partial<Record<SatDomainCode, SelfRatingValue>> | null;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const current = (code: SatDomainCode): string | null => {
    if (!defaults || !Object.hasOwn(defaults, code)) return null;
    const v = defaults[code];
    return v == null ? 'unsure' : String(v);
  };
  const sections = [...new Set(rows.map((r) => r.section))];

  return (
    <form action={formAction} className={s.form}>
      <div className={s.ratingScale} aria-hidden="true">
        <span />
        <div className={s.ratingScaleLabels}>
          <span>1 · not comfortable</span>
          <span>5 · very comfortable</span>
        </div>
      </div>
      <div className={s.ratingGrid} role="group" aria-label="Comfort by area">
        {sections.map((section) => (
          <div key={section} className={s.ratingGrid}>
            <div className={s.ratingSection}>{section}</div>
            {rows
              .filter((r) => r.section === section)
              .map((r) => {
                const chosen = current(r.code);
                return (
                  <fieldset key={r.code} className={s.ratingRow}>
                    <legend className={s.ratingLegend}>
                      <span className={s.ratingName}>{r.name}</span>
                      <span className={s.ratingExample}>{r.example}</span>
                    </legend>
                    <div className={s.ratingOptions}>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <label key={v} className={s.ratingOption} title={String(v)}>
                          <input
                            type="radio"
                            name={`rating_${r.code}`}
                            value={v}
                            required
                            defaultChecked={chosen === String(v)}
                            aria-label={`${r.name}: ${v}`}
                          />
                          <span>{v}</span>
                        </label>
                      ))}
                      <label className={`${s.ratingOption} ${s.ratingUnsure}`} title="I'm not sure">
                        <input
                          type="radio"
                          name={`rating_${r.code}`}
                          value="unsure"
                          defaultChecked={chosen === 'unsure'}
                          aria-label={`${r.name}: not sure`}
                        />
                        <span>Not sure</span>
                      </label>
                    </div>
                  </fieldset>
                );
              })}
          </div>
        ))}
      </div>
      <SubmitRow pending={pending} label="Build my plan" pendingLabel="Building your plan…" state={state} />
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
        {pending ? 'One moment…' : 'Skip for now'}
      </button>
      <ErrorNote state={state} />
    </form>
  );
}
