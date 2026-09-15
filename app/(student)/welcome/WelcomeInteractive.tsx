// Client islands for the onboarding intake (docs/student-onboarding-and-
// plan-redesign-2026-09.md §3). Each step's form wires a route-local
// Server Action via useActionState; the step progression is server-
// derived (page.tsx re-renders after each action revalidates the route),
// so these islands hold no wizard state — just inputs and pending/error
// affordances.

'use client';

import { useActionState } from 'react';
import type { ActionResult } from '@/lib/types';
import type { PrepLevel, Intent, SatDomainCode } from '@/lib/plan/intake';
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

// ── Step 1: situation ─────────────────────────────────────────────

const PREP_OPTIONS: { value: PrepLevel; title: string; sub: string }[] = [
  { value: 'none', title: "I'm starting from scratch", sub: 'Little or no SAT prep so far.' },
  { value: 'some', title: "I've done some studying", sub: 'A class, some practice, or a test or two.' },
  { value: 'a_lot', title: "I've prepped seriously", sub: 'Tutoring or a lot of practice — I want to sharpen weak areas.' },
];

const INTENT_OPTIONS: { value: Intent; title: string; sub: string }[] = [
  { value: 'guide_me', title: 'Guide me', sub: 'Build the plan around what you know about me.' },
  { value: 'own_targets', title: 'I know what I need', sub: "I'll pick the skills; you schedule them." },
];

export function SituationForm({
  action,
  defaults,
}: {
  action: WizardAction;
  defaults: { target: number | ''; testDate: string; prepLevel: PrepLevel | null; intent: Intent | null };
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={formAction} className={s.form}>
      <div className={s.fieldRow}>
        <label className={s.field}>
          <span className={s.label}>Target score</span>
          <input
            className={s.input}
            name="target"
            type="number"
            min={400}
            max={1600}
            step={10}
            required
            defaultValue={defaults.target}
            placeholder="1400"
          />
        </label>
        <label className={s.field}>
          <span className={s.label}>Test date</span>
          <input
            className={s.input}
            name="testDate"
            type="date"
            required
            defaultValue={defaults.testDate}
          />
        </label>
      </div>

      <fieldset className={s.fieldset}>
        <legend className={s.label}>How much prep have you done so far?</legend>
        <div className={s.choiceGrid}>
          {PREP_OPTIONS.map((o) => (
            <label key={o.value} className={s.choice}>
              <input
                type="radio"
                name="prepLevel"
                value={o.value}
                required
                defaultChecked={defaults.prepLevel === o.value}
              />
              <span className={s.choiceBody}>
                <span className={s.choiceTitle}>{o.title}</span>
                <span className={s.choiceSub}>{o.sub}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={s.fieldset}>
        <legend className={s.label}>How do you want the plan to work?</legend>
        <div className={s.choiceGrid}>
          {INTENT_OPTIONS.map((o) => (
            <label key={o.value} className={s.choice}>
              <input
                type="radio"
                name="intent"
                value={o.value}
                required
                defaultChecked={(defaults.intent ?? 'guide_me') === o.value}
              />
              <span className={s.choiceBody}>
                <span className={s.choiceTitle}>{o.title}</span>
                <span className={s.choiceSub}>{o.sub}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <SubmitRow pending={pending} label="Continue" pendingLabel="Saving…" state={state} />
    </form>
  );
}

// ── Step 2: targets ───────────────────────────────────────────────

export function TargetsForm({
  action,
  domains,
  selected,
  fullTests,
}: {
  action: WizardAction;
  domains: SatDomain[];
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
          <legend className={s.skillDomain}>{d.name}</legend>
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
      <SubmitRow pending={pending} label="Continue" pendingLabel="Saving…" state={state} />
    </form>
  );
}

// ── Step 3: availability ──────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AvailabilityForm({
  action,
  defaults,
}: {
  action: WizardAction;
  defaults: { weeklyHours: number; studyDays: number[] };
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const days = new Set(defaults.studyDays);

  return (
    <form action={formAction} className={s.form}>
      <label className={s.field}>
        <span className={s.label}>Hours you can study per week</span>
        <input
          className={s.input}
          name="weeklyHours"
          type="number"
          min={1}
          max={40}
          step={1}
          required
          defaultValue={defaults.weeklyHours}
        />
      </label>
      <fieldset className={s.fieldset}>
        <legend className={s.label}>Which days can you study?</legend>
        <div className={s.dayRow}>
          {DAY_LABELS.map((label, i) => (
            <label key={label} className={s.dayChip}>
              <input type="checkbox" name="day" value={i} defaultChecked={days.has(i)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitRow pending={pending} label="Continue" pendingLabel="Saving…" state={state} />
    </form>
  );
}

// ── Step 4: self-assessment ───────────────────────────────────────

const RATING_LABELS = ['Not comfortable', '', 'So-so', '', 'Very comfortable'];

export function SelfAssessmentForm({
  action,
  rows,
  defaults,
}: {
  action: WizardAction;
  rows: { code: SatDomainCode; name: string; section: string }[];
  defaults: Partial<Record<SatDomainCode, number>> | null;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={formAction} className={s.form}>
      <div className={s.ratingScaleHint} aria-hidden="true">
        <span>1 · Not comfortable</span>
        <span>3 · So-so</span>
        <span>5 · Very comfortable</span>
      </div>
      <div className={s.ratingTable} role="group" aria-label="Comfort by area">
        {rows.map((r) => (
          <fieldset key={r.code} className={s.ratingRow}>
            <legend className={s.ratingLegend}>
              <span className={s.ratingName}>{r.name}</span>
              <span className={s.ratingSection}>{r.section}</span>
            </legend>
            <div className={s.ratingOptions}>
              {[1, 2, 3, 4, 5].map((v) => (
                <label key={v} className={s.ratingOption} title={RATING_LABELS[v - 1] || undefined}>
                  <input
                    type="radio"
                    name={`rating_${r.code}`}
                    value={v}
                    required
                    defaultChecked={defaults?.[r.code] === v}
                  />
                  <span>{v}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <SubmitRow
        pending={pending}
        label="Build my plan"
        pendingLabel="Building your plan…"
        state={state}
      />
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

export function ActivateFirstPlanButton({
  action,
  planId,
}: {
  action: WizardAction;
  planId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={s.inlineForm}>
      <input type="hidden" name="planId" value={planId} />
      <button className={s.primaryBtn} type="submit" disabled={pending}>
        {pending ? 'Activating…' : 'Start my plan'}
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
