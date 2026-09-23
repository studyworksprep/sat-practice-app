// Client island for one unit's syllabus, written for a non-technical
// editor: steps are cards in teaching order, every action is a plain
// button, lessons are picked from a searchable list (never by id), and
// skills are chosen by name. A "what a student will see" panel runs the
// generator's own expandUnitSyllabus, so the preview is the task list a
// plan emits for a student who has completed none of these lessons.
//
// Mutations go through ../actions and the list is refetched via
// router.refresh(), so the order shown is the order the generator
// walks.

'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { expandUnitSyllabus, type UnitStep } from '@/lib/plan/generate-plan';
import { COUNT_MAX, COUNT_MIN, MINUTES_MAX, MINUTES_MIN } from '@/lib/admin/unitSyllabus';
import type { ActionResult } from '@/lib/types';
import {
  addUnitStep,
  deleteUnitStep,
  moveUnitStep,
  resetUnitSyllabus,
  updateUnitStep,
  type StepFormInput,
} from '../actions';
import f from '../../../forms.module.css';
import a from '../../../admin.module.css';

export interface EditorStep {
  id: string;
  position: number;
  kind: 'lesson' | 'drill';
  lessonId: string | null;
  lessonTitle: string | null;
  lessonStatus: string | null;
  role: 'practice' | 'mixed' | null;
  skillCodes: string[] | null;
  patternId: string | null;
  patternName: string | null;
  questionCount: number | null;
  minutes: number | null;
  skipIfCompleted: boolean;
}

export interface EditorLesson {
  id: string;
  title: string;
  status: string;
  kind: string;
  description: string | null;
  /** Skill names this lesson is tagged to. */
  skills: string[];
  taggedToUnit: boolean;
  /** Titles of other units whose syllabus already uses it. */
  otherUnits: string[];
}

export interface EditorPattern {
  id: string;
  name: string;
  cue: string;
}

interface UnitInfo {
  id: string;
  domainCode: string;
  domainName: string;
  skillCode: string;
  skillName: string;
  title: string;
  expectedMinutes: number;
  authoredAt: string | null;
}

type StepKind = 'lesson' | 'practice' | 'mixed';

interface FormValues {
  kind: StepKind;
  lessonId: string;
  skipIfCompleted: boolean;
  questionCount: string;
  skillMode: 'unit' | 'choose';
  skillCodes: string[];
  patternId: string;
  minutes: string;
}

interface Composer {
  mode: 'add' | 'edit';
  afterStepId: string | null;
  stepId: string | null;
  values: FormValues;
}

const KIND_LABEL: Record<StepKind, string> = { lesson: 'Lesson', practice: 'Practice', mixed: 'Mixed set' };
const SKILL_NAME = new Map(SAT_TAXONOMY.flatMap((d) => d.skills.map((s) => [s.code, s.name] as const)));

function emptyValues(kind: StepKind, unit: UnitInfo): FormValues {
  return {
    kind,
    lessonId: '',
    skipIfCompleted: true,
    questionCount: '',
    skillMode: 'unit',
    skillCodes: [unit.skillCode],
    patternId: '',
    minutes: '',
  };
}

function valuesFromStep(step: EditorStep, unit: UnitInfo): FormValues {
  const explicit = step.skillCodes && step.skillCodes.length > 0;
  return {
    kind: step.kind === 'lesson' ? 'lesson' : step.role === 'mixed' ? 'mixed' : 'practice',
    lessonId: step.lessonId ?? '',
    skipIfCompleted: step.skipIfCompleted,
    questionCount: step.questionCount == null ? '' : String(step.questionCount),
    skillMode: explicit ? 'choose' : 'unit',
    skillCodes: explicit ? step.skillCodes! : [unit.skillCode],
    patternId: step.patternId ?? '',
    minutes: step.minutes == null ? '' : String(step.minutes),
  };
}

function toInput(v: FormValues): StepFormInput {
  if (v.kind === 'lesson') {
    return { kind: 'lesson', lessonId: v.lessonId, skipIfCompleted: v.skipIfCompleted, minutes: v.minutes };
  }
  return {
    kind: 'drill',
    role: v.kind,
    skillCodes: v.skillMode === 'choose' ? v.skillCodes : null,
    patternId: v.patternId || null,
    questionCount: v.questionCount,
    minutes: v.minutes,
  };
}

function toUnitStep(step: EditorStep): UnitStep {
  return {
    id: step.id,
    position: step.position,
    kind: step.kind,
    lessonId: step.lessonId,
    lessonTitle: step.lessonTitle,
    role: step.role,
    skillCodes: step.skillCodes,
    patternId: step.patternId,
    questionCount: step.questionCount,
    minutes: step.minutes,
    skipIfCompleted: step.skipIfCompleted,
  };
}

export function UnitEditor({
  unit,
  steps,
  lessons,
  patterns,
}: {
  unit: UnitInfo;
  steps: EditorStep[];
  lessons: EditorLesson[];
  patterns: EditorPattern[];
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  /** Which "add a step here" chooser is open: a step id, 'end', or null. */
  const [chooserAt, setChooserAt] = useState<string | null>(null);

  const preview = useMemo(
    () =>
      expandUnitSyllabus(
        { domainCode: unit.domainCode, skillCode: unit.skillCode, expectedMinutes: unit.expectedMinutes },
        steps.map(toUnitStep),
      ),
    [steps, unit],
  );
  const previewMinutes = preview.reduce(
    (n, t) => n + (typeof t.payload.minutes === 'number' ? t.payload.minutes : 0),
    0,
  );

  function run<T extends Record<string, unknown>>(fn: () => Promise<ActionResult<T>>, ok: string) {
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setNotice({ kind: 'err', text: res.error });
        return;
      }
      setNotice({ kind: 'ok', text: ok });
      setComposer(null);
      setChooserAt(null);
      router.refresh();
    });
  }

  function openAdd(kind: StepKind, afterStepId: string | null) {
    setComposer({ mode: 'add', afterStepId, stepId: null, values: emptyValues(kind, unit) });
    setChooserAt(null);
    setNotice(null);
  }

  function openEdit(step: EditorStep) {
    setComposer({ mode: 'edit', afterStepId: null, stepId: step.id, values: valuesFromStep(step, unit) });
    setChooserAt(null);
    setNotice(null);
  }

  function save() {
    if (!composer) return;
    const input = toInput(composer.values);
    if (composer.mode === 'edit' && composer.stepId) {
      run(() => updateUnitStep({ stepId: composer.stepId!, input }), 'Step saved.');
    } else {
      run(() => addUnitStep({ unitId: unit.id, input, afterStepId: composer.afterStepId }), 'Step added.');
    }
  }

  async function remove(step: EditorStep) {
    const ok = await confirm({
      title: 'Remove this step?',
      body: 'New plans will no longer include it. Tasks already on students’ plans are not affected.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    run(() => deleteUnitStep({ stepId: step.id }), 'Step removed.');
  }

  async function reset() {
    const ok = await confirm({
      title: 'Start over with the default?',
      body: 'Replaces every step with the default pair: the first published lesson for this skill, then one practice set of 8 questions. The unit is marked as not yet authored.',
      confirmLabel: 'Start over',
      tone: 'danger',
    });
    if (!ok) return;
    run(() => resetUnitSyllabus({ unitId: unit.id }), 'Reset to the default.');
  }

  const composerAnchor = composer?.mode === 'edit' ? composer.stepId : composer?.afterStepId ?? 'end';

  return (
    <div style={S.layout}>
      <div style={{ flex: '1 1 480px', minWidth: 0 }}>
        <div style={S.toolbar}>
          <span className={f.muted}>
            {steps.length} step{steps.length === 1 ? '' : 's'} ·{' '}
            {unit.authoredAt ? (
              <span style={S.ready}>authored {unit.authoredAt.slice(0, 10)}</span>
            ) : (
              <span style={S.default}>default — not yet authored</span>
            )}
          </span>
          <Button size="sm" variant="secondary" onClick={reset} disabled={pending || steps.length === 0}>
            Start over with the default
          </Button>
        </div>

        {notice && (
          <p className={notice.kind === 'ok' ? f.ok : f.err} role="status">
            {notice.text}
          </p>
        )}

        {steps.length === 0 && (
          <p className={f.empty}>This unit has no steps yet. Add its first lesson below.</p>
        )}

        <ol style={S.cards}>
          {steps.map((step, index) => (
            <li key={step.id} style={S.cardWrap}>
              {composer?.mode === 'edit' && composer.stepId === step.id ? (
                <StepComposer
                  composer={composer}
                  onChange={(values) => setComposer({ ...composer, values })}
                  onSave={save}
                  onCancel={() => setComposer(null)}
                  pending={pending}
                  unit={unit}
                  lessons={lessons}
                  patterns={patterns}
                  title={`Edit step ${step.position}`}
                />
              ) : (
                <StepCard
                  step={step}
                  unit={unit}
                  isFirst={index === 0}
                  isLast={index === steps.length - 1}
                  pending={pending}
                  onMove={(direction) =>
                    run(() => moveUnitStep({ stepId: step.id, direction }), 'Reordered.')
                  }
                  onEdit={() => openEdit(step)}
                  onRemove={() => remove(step)}
                />
              )}

              {/* Insert point after this card. */}
              {composer?.mode === 'add' && composerAnchor === step.id ? (
                <StepComposer
                  composer={composer}
                  onChange={(values) => setComposer({ ...composer, values })}
                  onSave={save}
                  onCancel={() => setComposer(null)}
                  pending={pending}
                  unit={unit}
                  lessons={lessons}
                  patterns={patterns}
                  title={`New ${KIND_LABEL[composer.values.kind].toLowerCase()} after step ${step.position}`}
                />
              ) : (
                <InsertPoint
                  open={chooserAt === step.id}
                  onOpen={() => setChooserAt(chooserAt === step.id ? null : step.id)}
                  onPick={(kind) => openAdd(kind, step.id)}
                  disabled={pending}
                  compact
                />
              )}
            </li>
          ))}
        </ol>

        {composer?.mode === 'add' && composerAnchor === 'end' ? (
          <StepComposer
            composer={composer}
            onChange={(values) => setComposer({ ...composer, values })}
            onSave={save}
            onCancel={() => setComposer(null)}
            pending={pending}
            unit={unit}
            lessons={lessons}
            patterns={patterns}
            title={`New ${KIND_LABEL[composer.values.kind].toLowerCase()} at the end`}
          />
        ) : (
          <InsertPoint
            open={chooserAt === 'end' || steps.length === 0}
            onOpen={() => setChooserAt(chooserAt === 'end' ? null : 'end')}
            onPick={(kind) => openAdd(kind, null)}
            disabled={pending}
          />
        )}
      </div>

      <aside style={S.preview}>
        <h2 className={a.sectionLabel} style={{ marginTop: 0 }}>What a student will see</h2>
        {preview.length === 0 ? (
          <p className={f.muted} style={{ margin: 0 }}>Nothing yet.</p>
        ) : (
          <ol style={S.previewList}>
            {preview.map((t, i) => (
              <li key={i}>
                <span style={{ fontWeight: 600 }}>{String(t.payload.title ?? '')}</span>
                {typeof t.payload.minutes === 'number' && (
                  <span className={f.muted}> · ~{t.payload.minutes} min</span>
                )}
              </li>
            ))}
          </ol>
        )}
        <p className={f.muted} style={{ marginBottom: 0 }}>
          About {previewMinutes} minutes in total, for a student who has completed none of these lessons. A
          lesson already completed in an earlier unit is skipped; its practice set still runs.
        </p>
      </aside>

      {confirmDialog}
    </div>
  );
}

// ── Cards ─────────────────────────────────────────────────────────

function StepCard({
  step,
  unit,
  isFirst,
  isLast,
  pending,
  onMove,
  onEdit,
  onRemove,
}: {
  step: EditorStep;
  unit: UnitInfo;
  isFirst: boolean;
  isLast: boolean;
  pending: boolean;
  onMove: (direction: 'up' | 'down') => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const kind: StepKind = step.kind === 'lesson' ? 'lesson' : step.role === 'mixed' ? 'mixed' : 'practice';
  const skills =
    step.skillCodes && step.skillCodes.length > 0
      ? step.skillCodes.map((c) => SKILL_NAME.get(c) ?? c).join(', ')
      : null;
  return (
    <div style={S.card}>
      <div style={S.cardNum}>{step.position}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.cardTitle}>
          <span style={kind === 'lesson' ? S.tagLesson : kind === 'mixed' ? S.tagMixed : S.tagPractice}>{KIND_LABEL[kind]}</span>
          {kind === 'lesson' ? (
            <span>{step.lessonTitle ?? 'Missing lesson'}</span>
          ) : (
            <span>
              {step.questionCount ?? (kind === 'mixed' ? 10 : 8)} questions
              {step.patternName ? ` · only "${step.patternName}"` : ''}
            </span>
          )}
          {kind === 'lesson' && step.lessonStatus && step.lessonStatus !== 'published' && (
            <span style={S.warnTag}>{step.lessonStatus} — students won&rsquo;t get it until it is published</span>
          )}
        </div>
        <div className={f.muted} style={{ marginTop: 2 }}>
          {kind === 'lesson'
            ? step.skipIfCompleted
              ? 'Skipped for a student who already completed it in an earlier unit'
              : 'Always assigned, even if already completed'
            : kind === 'mixed'
              ? skills
                ? `Questions from: ${skills}`
                : `Questions from everything covered so far in ${unit.domainName}`
              : skills
                ? `Questions from: ${skills}`
                : `Questions on ${unit.skillName}`}
          {step.minutes != null ? ` · about ${step.minutes} min` : ''}
        </div>
      </div>
      <div style={S.cardActions}>
        <button type="button" style={S.iconBtn} disabled={pending || isFirst} aria-label="Move earlier" title="Move earlier" onClick={() => onMove('up')}>&uarr;</button>
        <button type="button" style={S.iconBtn} disabled={pending || isLast} aria-label="Move later" title="Move later" onClick={() => onMove('down')}>&darr;</button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={onEdit}>Edit</Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={onRemove}>Remove</Button>
      </div>
    </div>
  );
}

function InsertPoint({
  open,
  onOpen,
  onPick,
  disabled,
  compact = false,
}: {
  open: boolean;
  onOpen: () => void;
  onPick: (kind: StepKind) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  if (!open) {
    return (
      <div style={compact ? S.insertCompact : S.insert}>
        <button type="button" style={compact ? S.insertLink : S.insertBtn} onClick={onOpen} disabled={disabled}>
          {compact ? '+ add a step here' : '+ Add a step'}
        </button>
      </div>
    );
  }
  return (
    <div style={S.chooser}>
      <span className={f.muted} style={{ marginRight: 8 }}>Add:</span>
      <Button size="sm" variant="primary" disabled={disabled} onClick={() => onPick('lesson')}>A lesson</Button>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onPick('practice')}>Practice questions</Button>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onPick('mixed')}>A mixed set</Button>
      {!compact ? null : (
        <button type="button" style={S.insertLink} onClick={onOpen} disabled={disabled}>cancel</button>
      )}
    </div>
  );
}

// ── Composer (add / edit) ──────────────────────────────────────────

function StepComposer({
  composer,
  onChange,
  onSave,
  onCancel,
  pending,
  unit,
  lessons,
  patterns,
  title,
}: {
  composer: Composer;
  onChange: (values: FormValues) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
  unit: UnitInfo;
  lessons: EditorLesson[];
  patterns: EditorPattern[];
  title: string;
}) {
  const v = composer.values;
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => onChange({ ...v, [key]: value });
  const canSave = v.kind === 'lesson' ? Boolean(v.lessonId) : v.skillMode === 'unit' || v.skillCodes.length > 0;

  return (
    <form
      className={f.form}
      style={S.composer}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave();
      }}
    >
      <div style={S.composerHead}>
        <h3 className={a.sectionLabel} style={{ margin: 0 }}>{title}</h3>
        {composer.mode === 'edit' && (
          <select
            className={f.select}
            value={v.kind}
            disabled={pending}
            aria-label="Step type"
            onChange={(e) => onChange({ ...emptyValues(e.target.value as StepKind, unit), minutes: v.minutes })}
          >
            <option value="lesson">Lesson</option>
            <option value="practice">Practice questions</option>
            <option value="mixed">Mixed set</option>
          </select>
        )}
      </div>

      {v.kind === 'lesson' ? (
        <>
          <LessonPicker lessons={lessons} value={v.lessonId} onPick={(id) => set('lessonId', id)} disabled={pending} />
          <fieldset className={f.fieldset}>
            <legend className={f.legend}>If the student already completed this lesson in an earlier unit</legend>
            <label className={f.row}>
              <input type="radio" name="skip" checked={v.skipIfCompleted} disabled={pending} onChange={() => set('skipIfCompleted', true)} />
              <span>Skip it — go straight to the practice set (recommended)</span>
            </label>
            <label className={f.row}>
              <input type="radio" name="skip" checked={!v.skipIfCompleted} disabled={pending} onChange={() => set('skipIfCompleted', false)} />
              <span>Assign it again anyway</span>
            </label>
          </fieldset>
        </>
      ) : (
        <>
          <div className={f.grid}>
            <label className={f.label}>
              <span className={f.labelText}>How many questions?</span>
              <input
                className={f.inputNarrow}
                type="number"
                min={COUNT_MIN}
                max={COUNT_MAX}
                value={v.questionCount}
                disabled={pending}
                placeholder={v.kind === 'mixed' ? '10' : '8'}
                onChange={(e) => set('questionCount', e.target.value)}
              />
            </label>
            {v.kind === 'practice' && patterns.length > 0 && (
              <label className={f.label} style={{ gridColumn: 'span 2' }}>
                <span className={f.labelText}>Only one question type? <span className={f.muted}>(optional)</span></span>
                <select className={f.select} value={v.patternId} disabled={pending} onChange={(e) => set('patternId', e.target.value)}>
                  <option value="">Any question in the skill</option>
                  {patterns.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <span className={f.formHint}>
                  Drill exactly this format. Until questions are tagged to it, the whole skill is used.
                </span>
              </label>
            )}
          </div>

          <fieldset className={f.fieldset}>
            <legend className={f.legend}>Which questions?</legend>
            <label className={f.row}>
              <input type="radio" name="skillMode" checked={v.skillMode === 'unit'} disabled={pending} onChange={() => set('skillMode', 'unit')} />
              <span>
                {v.kind === 'mixed'
                  ? `Everything covered so far in ${unit.domainName} (automatic — recommended)`
                  : `This unit: ${unit.skillName} (recommended)`}
              </span>
            </label>
            <label className={f.row}>
              <input type="radio" name="skillMode" checked={v.skillMode === 'choose'} disabled={pending} onChange={() => set('skillMode', 'choose')} />
              <span>Choose the skills myself</span>
            </label>
            {v.skillMode === 'choose' && (
              <div style={S.skillGroups}>
                {SAT_TAXONOMY.map((d) => (
                  <div key={d.code} style={S.skillGroup}>
                    <div style={S.skillGroupTitle}>{d.name}</div>
                    {d.skills.map((s) => {
                      const checked = v.skillCodes.includes(s.code);
                      return (
                        <label key={s.code} className={f.row} style={{ margin: 0 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={pending}
                            onChange={(e) =>
                              set(
                                'skillCodes',
                                e.target.checked
                                  ? [...v.skillCodes, s.code]
                                  : v.skillCodes.filter((c) => c !== s.code),
                              )
                            }
                          />
                          <span>{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        </>
      )}

      <label className={f.label} style={{ maxWidth: 260 }}>
        <span className={f.labelText}>Time estimate in minutes <span className={f.muted}>(optional)</span></span>
        <input
          className={f.inputNarrow}
          type="number"
          min={MINUTES_MIN}
          max={MINUTES_MAX}
          value={v.minutes}
          disabled={pending}
          placeholder={String(unit.expectedMinutes)}
          onChange={(e) => set('minutes', e.target.value)}
        />
        <span className={f.formHint}>Shown to the student as &ldquo;about N min&rdquo;. Blank uses the unit&rsquo;s usual time.</span>
      </label>

      <div className={f.actions}>
        <Button type="submit" variant="primary" disabled={pending || !canSave}>
          {pending ? 'Saving…' : composer.mode === 'edit' ? 'Save changes' : 'Add step'}
        </Button>{' '}
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function LessonPicker({
  lessons,
  value,
  onPick,
  disabled,
}: {
  lessons: EditorLesson[];
  value: string;
  onPick: (id: string) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = q
    ? lessons.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          (l.description ?? '').toLowerCase().includes(q) ||
          l.skills.some((s) => s.toLowerCase().includes(q)),
      )
    : lessons;
  const suggested = matches.filter((l) => l.taggedToUnit);
  const rest = matches.filter((l) => !l.taggedToUnit);
  const selected = lessons.find((l) => l.id === value) ?? null;

  const Row = ({ l }: { l: EditorLesson }) => (
    <button
      type="button"
      onClick={() => onPick(l.id)}
      disabled={disabled}
      style={{ ...S.lessonRow, ...(l.id === value ? S.lessonRowSelected : null) }}
      aria-pressed={l.id === value}
    >
      <span style={{ fontWeight: 600 }}>
        {l.title}
        {l.status !== 'published' && <span style={S.warnTag}>{l.status}</span>}
        {l.kind === 'foundation' && <span style={S.infoTag}>foundation</span>}
      </span>
      <span className={f.muted} style={{ fontSize: '0.8rem' }}>
        {l.skills.length > 0 ? `Teaches: ${l.skills.join(', ')}` : 'Not tagged to a skill yet'}
        {l.otherUnits.length > 0 ? ` · Also in: ${l.otherUnits.join(', ')}` : ''}
      </span>
    </button>
  );

  return (
    <div>
      <label className={f.label}>
        <span className={f.labelText}>Which lesson?</span>
        <input
          className={f.input}
          type="search"
          placeholder="Search lessons by title or skill…"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {selected && (
        <p className={f.ok} style={{ margin: '0 0 6px' }}>
          Selected: <strong>{selected.title}</strong>
        </p>
      )}
      <div style={S.lessonList}>
        {suggested.length > 0 && (
          <>
            <div style={S.lessonGroup}>Tagged to this unit</div>
            {suggested.map((l) => <Row key={l.id} l={l} />)}
          </>
        )}
        {rest.length > 0 && (
          <>
            <div style={S.lessonGroup}>{suggested.length > 0 ? 'All other lessons' : 'All lessons'}</div>
            {rest.map((l) => <Row key={l.id} l={l} />)}
          </>
        )}
        {matches.length === 0 && <p className={f.muted} style={{ margin: 8 }}>No lessons match.</p>}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  // Flex + wrap rather than a fixed two-column grid: on a narrow window
  // the preview drops below the cards instead of squeezing them.
  layout: { display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'flex-start' },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' },
  cards: { listStyle: 'none', margin: 0, padding: 0 },
  cardWrap: { margin: 0 },
  card: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    background: '#fff',
  },
  cardNum: {
    flex: '0 0 auto',
    width: 28,
    height: 28,
    borderRadius: 999,
    background: '#f3f4f6',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '0.85rem',
  },
  cardTitle: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.95rem' },
  cardActions: { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 },
  iconBtn: { border: '1px solid #d1d5db', background: 'white', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1, padding: '6px 8px' },
  tagLesson: { padding: '1px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, background: '#ecfeff', color: '#0e7490' },
  tagPractice: { padding: '1px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, background: '#fef3c7', color: '#92400e' },
  tagMixed: { padding: '1px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, background: '#e0e7ff', color: '#3730a3' },
  warnTag: { marginLeft: 6, padding: '1px 6px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: '#fee2e2', color: '#991b1b' },
  infoTag: { marginLeft: 6, padding: '1px 6px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: '#f3f4f6', color: '#374151' },
  ready: { padding: '1px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: '#dcfce7', color: '#166534' },
  default: { padding: '1px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: '#f3f4f6', color: '#374151' },
  insert: { padding: '0.75rem 0' },
  insertCompact: { padding: '2px 0 2px 40px' },
  insertBtn: { border: '1px dashed #9ca3af', background: '#f9fafb', borderRadius: 10, padding: '10px 16px', width: '100%', cursor: 'pointer', fontWeight: 600, color: '#374151' },
  insertLink: { border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.78rem', padding: '2px 4px' },
  chooser: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 0 8px 40px' },
  composer: { border: '1px solid #c7d2fe', background: '#f8faff', borderRadius: 10, padding: '0.75rem 1rem', margin: '6px 0' },
  composerHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' },
  skillGroups: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem 1rem', marginTop: '0.5rem' },
  skillGroup: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.85rem' },
  skillGroupTitle: { fontWeight: 700, fontSize: '0.78rem', color: '#374151', margin: '4px 0 2px' },
  lessonList: { maxHeight: 320, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' },
  lessonGroup: { padding: '6px 10px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', background: '#f9fafb', position: 'sticky', top: 0 },
  lessonRow: { display: 'flex', flexDirection: 'column', gap: 2, width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid #f3f4f6', background: 'white', padding: '8px 10px', cursor: 'pointer', font: 'inherit' },
  lessonRowSelected: { background: '#eef2ff' },
  preview: { flex: '1 1 260px', maxWidth: 320, position: 'sticky', top: '1rem', padding: '0.75rem 1rem', border: '1px solid #e5e7eb', borderRadius: 10, background: '#f9fafb', fontSize: '0.88rem' },
  previewList: { margin: '0 0 0.75rem', paddingLeft: '1.2rem', lineHeight: 1.6 },
};
