// Client island for one unit's syllabus: ordered steps with a
// "student sees" preview, add / edit / reorder / delete, and reset to
// the backfilled default. Mutations go through ../../syllabus-actions
// and the list is refetched via router.refresh(), so the order shown is
// the order the generator will walk.
//
// The preview runs the generator's own expandUnitSyllabus (pure), so
// what the admin reads here is the exact task list a plan emits for a
// student who has completed none of these lessons.

'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { Table, Th, Td } from '@/lib/ui/Table';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { expandUnitSyllabus, type UnitStep } from '@/lib/plan/generate-plan';
import { COUNT_MAX, COUNT_MIN, MINUTES_MAX, MINUTES_MIN } from '@/lib/admin/unitSyllabusCsv';
import type { ActionResult } from '@/lib/types';
import {
  addUnitStep,
  deleteUnitStep,
  moveUnitStep,
  resetUnitSyllabus,
  updateUnitStep,
  type StepFormInput,
} from '../../syllabus-actions';
import f from '../../../../../forms.module.css';
import a from '../../../../../admin.module.css';

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
}

export interface EditorPattern {
  id: string;
  name: string;
}

interface UnitInfo {
  id: string;
  domainCode: string;
  skillCode: string;
  title: string;
  expectedMinutes: number;
  authoredAt: string | null;
}

interface FormValues {
  kind: 'lesson' | 'drill';
  lessonId: string;
  skipIfCompleted: boolean;
  role: 'practice' | 'mixed';
  skillCodes: string[];
  patternId: string;
  questionCount: string;
  minutes: string;
}

function emptyForm(kind: 'lesson' | 'drill', unitSkill: string): FormValues {
  return {
    kind,
    lessonId: '',
    skipIfCompleted: true,
    role: 'practice',
    skillCodes: [unitSkill],
    patternId: '',
    questionCount: '',
    minutes: '',
  };
}

function formFromStep(step: EditorStep, unitSkill: string): FormValues {
  return {
    kind: step.kind,
    lessonId: step.lessonId ?? '',
    skipIfCompleted: step.skipIfCompleted,
    role: step.role ?? 'practice',
    skillCodes: step.skillCodes && step.skillCodes.length > 0 ? step.skillCodes : [unitSkill],
    patternId: step.patternId ?? '',
    questionCount: step.questionCount == null ? '' : String(step.questionCount),
    minutes: step.minutes == null ? '' : String(step.minutes),
  };
}

function toInput(v: FormValues, unitSkill: string): StepFormInput {
  const onlyUnit = v.skillCodes.length === 1 && v.skillCodes[0] === unitSkill;
  return {
    kind: v.kind,
    lessonId: v.kind === 'lesson' ? v.lessonId : null,
    skipIfCompleted: v.skipIfCompleted,
    role: v.kind === 'drill' ? v.role : null,
    // The unit's own skill is the default; don't store it as an explicit
    // list, so a mixed set keeps its "domain so far" behavior.
    skillCodes: v.kind === 'drill' && !onlyUnit ? v.skillCodes : null,
    patternId: v.kind === 'drill' ? v.patternId || null : null,
    questionCount: v.kind === 'drill' ? v.questionCount : null,
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

export function SyllabusEditor({
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
  const [adding, setAdding] = useState<'lesson' | 'drill' | null>(null);
  const [addValues, setAddValues] = useState<FormValues>(emptyForm('lesson', unit.skillCode));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<FormValues>(emptyForm('lesson', unit.skillCode));

  // What a student with nothing completed would be assigned, in order.
  const preview = useMemo(
    () =>
      expandUnitSyllabus(
        { domainCode: unit.domainCode, skillCode: unit.skillCode, expectedMinutes: unit.expectedMinutes },
        steps.map(toUnitStep),
      ),
    [steps, unit],
  );
  // Map each step to its preview line (skipped duplicates get none).
  const previewByStepId = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of preview) {
      const id = typeof t.payload.unit_step_id === 'string' ? t.payload.unit_step_id : null;
      if (id && !map.has(id)) map.set(id, String(t.payload.title ?? ''));
    }
    return map;
  }, [preview]);

  function run<T extends Record<string, unknown>>(fn: () => Promise<ActionResult<T>>, ok: string) {
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setNotice({ kind: 'err', text: res.error });
        return;
      }
      setNotice({ kind: 'ok', text: ok });
      setAdding(null);
      setEditingId(null);
      router.refresh();
    });
  }

  async function handleReset() {
    const ok = await confirm({
      title: 'Reset this syllabus to the default?',
      body: 'The steps above are replaced by the default pair (the first published lesson tagged to this skill, then one 8-question drill) and the unit is marked as not yet authored.',
      confirmLabel: 'Reset',
      tone: 'danger',
    });
    if (!ok) return;
    run(() => resetUnitSyllabus({ unitId: unit.id }), 'Reset to the default syllabus.');
  }

  async function handleDelete(step: EditorStep) {
    const ok = await confirm({
      title: 'Remove this step?',
      body: 'Plans generated after this will not include it. Existing plan tasks are unchanged.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    run(() => deleteUnitStep({ stepId: step.id }), 'Step removed.');
  }

  const minutesTotal = preview.reduce((n, t) => n + (typeof t.payload.minutes === 'number' ? t.payload.minutes : 0), 0);

  return (
    <div>
      <div className={f.row} style={{ marginBottom: 'var(--s2, 0.5rem)', alignItems: 'center' }}>
        <span className={f.muted}>
          {steps.length} step{steps.length === 1 ? '' : 's'} · about {minutesTotal} min for a student
          who has completed none of the lessons ·{' '}
          {unit.authoredAt ? (
            <span style={S.okBadge}>authored {unit.authoredAt.slice(0, 10)}</span>
          ) : (
            <span style={S.defaultBadge}>default (not yet authored)</span>
          )}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Button
            size="sm"
            variant={adding === 'lesson' ? 'secondary' : 'primary'}
            disabled={pending}
            onClick={() => {
              setEditingId(null);
              setAddValues(emptyForm('lesson', unit.skillCode));
              setAdding(adding === 'lesson' ? null : 'lesson');
            }}
          >
            {adding === 'lesson' ? 'Close' : '+ Lesson step'}
          </Button>
          <Button
            size="sm"
            variant={adding === 'drill' ? 'secondary' : 'primary'}
            disabled={pending}
            onClick={() => {
              setEditingId(null);
              setAddValues(emptyForm('drill', unit.skillCode));
              setAdding(adding === 'drill' ? null : 'drill');
            }}
          >
            {adding === 'drill' ? 'Close' : '+ Drill step'}
          </Button>
          <Button size="sm" variant="secondary" disabled={pending || steps.length === 0} onClick={handleReset}>
            Reset to default
          </Button>
        </span>
      </div>

      {adding && (
        <div className={f.fieldset} style={{ marginBottom: '1rem' }}>
          <h3 className={a.sectionLabel}>New {adding} step (appended)</h3>
          <StepForm
            values={addValues}
            onChange={setAddValues}
            lessons={lessons}
            patterns={patterns}
            unitSkill={unit.skillCode}
            pending={pending}
            submitLabel="Add step"
            onCancel={() => setAdding(null)}
            onSubmit={() =>
              run(() => addUnitStep({ unitId: unit.id, input: toInput(addValues, unit.skillCode) }), 'Step added.')
            }
          />
        </div>
      )}

      {notice && (
        <p className={notice.kind === 'ok' ? f.ok : f.err} role="status">
          {notice.text}
        </p>
      )}

      {steps.length === 0 ? (
        <p className={f.empty}>
          No steps. Add a lesson step to begin, or reset to the default pair.
        </p>
      ) : (
        <Table style={{ fontSize: '0.86rem' }}>
          <thead>
            <tr>
              <Th style={{ width: '3.5rem' }}>#</Th>
              <Th>Step</Th>
              <Th>Student sees</Th>
              <Th style={{ width: '1%' }}></Th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, index) =>
              editingId === step.id ? (
                <tr key={step.id}>
                  <Td colSpan={4}>
                    <h3 className={a.sectionLabel}>Edit step {step.position}</h3>
                    <StepForm
                      values={editValues}
                      onChange={setEditValues}
                      lessons={lessons}
                      patterns={patterns}
                      unitSkill={unit.skillCode}
                      pending={pending}
                      submitLabel="Save changes"
                      onCancel={() => setEditingId(null)}
                      onSubmit={() =>
                        run(
                          () => updateUnitStep({ stepId: step.id, input: toInput(editValues, unit.skillCode) }),
                          'Step saved.',
                        )
                      }
                    />
                  </Td>
                </tr>
              ) : (
                <tr key={step.id}>
                  <Td style={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    {step.position}
                    <div style={S.moveGroup}>
                      <button
                        type="button"
                        style={S.moveButton}
                        disabled={pending || index === 0}
                        aria-label="Move earlier"
                        onClick={() => run(() => moveUnitStep({ stepId: step.id, direction: 'up' }), 'Reordered.')}
                      >
                        &uarr;
                      </button>
                      <button
                        type="button"
                        style={S.moveButton}
                        disabled={pending || index === steps.length - 1}
                        aria-label="Move later"
                        onClick={() => run(() => moveUnitStep({ stepId: step.id, direction: 'down' }), 'Reordered.')}
                      >
                        &darr;
                      </button>
                    </div>
                  </Td>
                  <Td style={{ verticalAlign: 'top' }}>
                    <StepSummary step={step} unitSkill={unit.skillCode} />
                  </Td>
                  <Td style={{ verticalAlign: 'top' }}>
                    {previewByStepId.get(step.id) ?? <span className={f.muted}>—</span>}
                  </Td>
                  <Td style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        setAdding(null);
                        setEditingId(step.id);
                        setEditValues(formFromStep(step, unit.skillCode));
                      }}
                    >
                      Edit
                    </Button>{' '}
                    <Button size="sm" variant="danger" disabled={pending} onClick={() => handleDelete(step)}>
                      Remove
                    </Button>
                  </Td>
                </tr>
              ),
            )}
          </tbody>
        </Table>
      )}

      {confirmDialog}
    </div>
  );
}

function StepSummary({ step, unitSkill }: { step: EditorStep; unitSkill: string }) {
  if (step.kind === 'lesson') {
    return (
      <div>
        <div style={{ fontWeight: 600 }}>
          <span style={S.kindLesson}>Lesson</span> {step.lessonTitle ?? step.lessonId}
          {step.lessonStatus && step.lessonStatus !== 'published' && (
            <span style={S.draftBadge}>{step.lessonStatus} — not walked until published</span>
          )}
        </div>
        <div className={f.tdMuted}>
          {step.skipIfCompleted ? 'Skipped for a student who already completed it' : 'Always assigned'}
          {step.minutes != null ? ` · ${step.minutes} min` : ''}
        </div>
      </div>
    );
  }
  const draws = step.skillCodes && step.skillCodes.length > 0 ? step.skillCodes.join(', ') : unitSkill;
  return (
    <div>
      <div style={{ fontWeight: 600 }}>
        <span style={step.role === 'mixed' ? S.kindMixed : S.kindDrill}>
          {step.role === 'mixed' ? 'Mixed set' : 'Practice drill'}
        </span>{' '}
        {step.questionCount ?? (step.role === 'mixed' ? 10 : 8)} questions
      </div>
      <div className={f.tdMuted}>
        Draws from {draws}
        {step.role === 'mixed' && !(step.skillCodes && step.skillCodes.length > 0)
          ? ' and the domain\'s earlier units'
          : ''}
        {step.patternName ? ` · pattern: ${step.patternName}` : ''}
        {step.minutes != null ? ` · ${step.minutes} min` : ''}
      </div>
    </div>
  );
}

function StepForm({
  values,
  onChange,
  lessons,
  patterns,
  unitSkill,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  values: FormValues;
  onChange: (v: FormValues) => void;
  lessons: EditorLesson[];
  patterns: EditorPattern[];
  unitSkill: string;
  pending: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => onChange({ ...values, [key]: value });
  return (
    <form
      className={f.form}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className={f.grid}>
        <label className={f.label}>
          <span className={f.labelText}>Kind</span>
          <select
            className={f.select}
            value={values.kind}
            disabled={pending}
            onChange={(e) => set('kind', e.target.value === 'drill' ? 'drill' : 'lesson')}
          >
            <option value="lesson">Lesson</option>
            <option value="drill">Drill</option>
          </select>
        </label>

        {values.kind === 'lesson' ? (
          <>
            <label className={f.label} style={{ gridColumn: 'span 2' }}>
              <span className={f.labelText}>Lesson</span>
              <select
                className={f.select}
                value={values.lessonId}
                disabled={pending}
                required
                onChange={(e) => set('lessonId', e.target.value)}
              >
                <option value="">Select a lesson…</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                    {l.status !== 'published' ? ` (${l.status})` : ''}
                    {l.kind === 'foundation' ? ' · foundation' : ''}
                  </option>
                ))}
              </select>
              <span className={f.formHint}>
                Any bank lesson. Draft lessons are kept on the syllabus but not walked until published.
              </span>
            </label>
            <label className={f.row}>
              <input
                type="checkbox"
                checked={values.skipIfCompleted}
                disabled={pending}
                onChange={(e) => set('skipIfCompleted', e.target.checked)}
              />
              <span>Skip for a student who already completed this lesson (e.g. in an earlier unit)</span>
            </label>
          </>
        ) : (
          <>
            <label className={f.label}>
              <span className={f.labelText}>Role</span>
              <select
                className={f.select}
                value={values.role}
                disabled={pending}
                onChange={(e) => set('role', e.target.value === 'mixed' ? 'mixed' : 'practice')}
              >
                <option value="practice">Practice — the questions for the lesson just taught</option>
                <option value="mixed">Mixed set — homework across the unit so far</option>
              </select>
            </label>
            <label className={f.label}>
              <span className={f.labelText}>Questions</span>
              <input
                className={f.inputNarrow}
                type="number"
                min={COUNT_MIN}
                max={COUNT_MAX}
                value={values.questionCount}
                disabled={pending}
                placeholder={values.role === 'mixed' ? '10' : '8'}
                onChange={(e) => set('questionCount', e.target.value)}
              />
            </label>
            <label className={f.label}>
              <span className={f.labelText}>Pattern <span className={f.muted}>(optional)</span></span>
              <select
                className={f.select}
                value={values.patternId}
                disabled={pending || patterns.length === 0}
                onChange={(e) => set('patternId', e.target.value)}
              >
                <option value="">{patterns.length === 0 ? `No patterns for ${unitSkill} yet` : 'Any format'}</option>
                {patterns.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <span className={f.formHint}>
                Drill exactly this question format. Falls back to the whole skill until questions are tagged.
              </span>
            </label>
            <label className={f.label} style={{ gridColumn: 'span 3' }}>
              <span className={f.labelText}>Draw from</span>
              <select
                className={f.select}
                multiple
                size={6}
                value={values.skillCodes}
                disabled={pending}
                onChange={(e) =>
                  set('skillCodes', Array.from(e.target.selectedOptions).map((o) => o.value))
                }
              >
                {SAT_TAXONOMY.map((d) => (
                  <optgroup key={d.code} label={`${d.subjectCode === 'math' ? 'Math' : 'R&W'} · ${d.name}`}>
                    {d.skills.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className={f.formHint}>
                Hold Cmd/Ctrl to pick several. Just this unit&rsquo;s skill means &ldquo;default&rdquo;: a
                practice drill stays on {unitSkill}; a mixed set also pulls the domain&rsquo;s earlier units.
              </span>
            </label>
          </>
        )}

        <label className={f.label}>
          <span className={f.labelText}>Minutes <span className={f.muted}>(optional)</span></span>
          <input
            className={f.inputNarrow}
            type="number"
            min={MINUTES_MIN}
            max={MINUTES_MAX}
            value={values.minutes}
            disabled={pending}
            placeholder="unit default"
            onChange={(e) => set('minutes', e.target.value)}
          />
        </label>
      </div>

      <div className={f.actions}>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>{' '}
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const S: Record<string, React.CSSProperties> = {
  moveGroup: { display: 'flex', gap: 2, marginTop: 4 },
  moveButton: {
    border: '1px solid #d1d5db',
    background: 'white',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: '0.7rem',
    lineHeight: 1,
    padding: '2px 5px',
  },
  kindLesson: { padding: '1px 7px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: '#ecfeff', color: '#0e7490', marginRight: 6 },
  kindDrill: { padding: '1px 7px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: '#fef3c7', color: '#92400e', marginRight: 6 },
  kindMixed: { padding: '1px 7px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: '#e0e7ff', color: '#3730a3', marginRight: 6 },
  draftBadge: { marginLeft: 6, padding: '1px 6px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 700, background: '#fee2e2', color: '#991b1b' },
  okBadge: { padding: '1px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: '#dcfce7', color: '#166534' },
  defaultBadge: { padding: '1px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: '#f3f4f6', color: '#374151' },
};
