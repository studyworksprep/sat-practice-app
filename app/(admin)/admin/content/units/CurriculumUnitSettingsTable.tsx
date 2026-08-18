// Client island for the active SAT curriculum-unit settings: teaching
// order, expected minutes, and mastery threshold. The server page owns
// loading and taxonomy labels; this component only coordinates admin
// mutations and then refreshes from the database.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { Table, Th, Td } from '@/lib/ui/Table';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import type { ActionResult } from '@/lib/types';
import {
  moveCurriculumUnit,
  updateCurriculumUnitSettings,
  type CurriculumUnitSettingsInput,
} from './actions';
import a from '../../../admin.module.css';
import f from '../../../forms.module.css';

export interface CurriculumUnitSettingsRow {
  id: string;
  domainCode: string;
  domainName: string;
  skillCode: string;
  skillName: string;
  title: string;
  section: 'Math' | 'R&W';
  sequence: number;
  expectedMinutes: number;
  masteryThreshold: number;
}

interface EditValues {
  expectedMinutes: string;
  masteryThreshold: string;
}

const EMPTY_VALUES: EditValues = { expectedMinutes: '', masteryThreshold: '' };

export function CurriculumUnitSettingsTable({
  units,
}: {
  units: CurriculumUnitSettingsRow[];
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditValues>(EMPTY_VALUES);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const sections: Array<{ name: CurriculumUnitSettingsRow['section']; units: CurriculumUnitSettingsRow[] }> = [
    { name: 'Math', units: units.filter((unit) => unit.section === 'Math') },
    { name: 'R&W', units: units.filter((unit) => unit.section === 'R&W') },
  ];

  function startEdit(unit: CurriculumUnitSettingsRow) {
    setEditingId(unit.id);
    setEditValues({
      expectedMinutes: String(unit.expectedMinutes),
      masteryThreshold: String(unit.masteryThreshold),
    });
    setNotice(null);
  }

  function runAction<T extends Record<string, unknown>>(
    fn: () => Promise<ActionResult<T>>,
    describe: (result: { ok: true } & T) => string,
  ) {
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setNotice({ kind: 'err', text: result.error });
        return;
      }
      setNotice({ kind: 'ok', text: describe(result) });
      setEditingId(null);
      setEditValues(EMPTY_VALUES);
      router.refresh();
    });
  }

  async function saveUnit(unit: CurriculumUnitSettingsRow) {
    const nextThreshold = Number(editValues.masteryThreshold);
    if (
      editValues.masteryThreshold.trim() !== '' &&
      Number.isInteger(nextThreshold) &&
      nextThreshold >= 0 &&
      nextThreshold <= 100 &&
      nextThreshold !== unit.masteryThreshold
    ) {
      const accepted = await confirm({
        title: `Change the mastery bar for ${unit.skillName}?`,
        body:
          `Changing the mastery bar from ${unit.masteryThreshold} to ${nextThreshold} can immediately ` +
          'change which students appear mastered or still working on this unit. Existing plan tasks are not rewritten.',
        confirmLabel: 'Save change',
      });
      if (!accepted) return;
    }

    const input: CurriculumUnitSettingsInput = {
      unitId: unit.id,
      expectedMinutes: editValues.expectedMinutes,
      masteryThreshold: editValues.masteryThreshold,
    };
    runAction(
      () => updateCurriculumUnitSettings(input),
      (result) =>
        `Saved ${unit.skillName}: ${result.data.expectedMinutes} minutes, mastery bar ${result.data.masteryThreshold}.`,
    );
  }

  return (
    <>
      <section className={a.section}>
        <h2 className={a.h2}>Active syllabus settings</h2>
        <p className={a.help}>
          Order breaks ties when plan priorities are otherwise equal. Expected time is the estimate on
          generated lesson tasks. The mastery bar controls coverage status and weakness prioritization.
          Existing plan tasks are never rewritten by these edits.
        </p>
        <p className={f.formHint} style={{ margin: 0 }}>
          Unit identity stays tied to the official SAT taxonomy. Prerequisites are intentionally omitted
          until the plan generator can honor them.
        </p>
        {notice && (
          <p className={notice.kind === 'ok' ? f.ok : f.err} role="status" style={{ margin: 0 }}>
            {notice.text}
          </p>
        )}
      </section>

      {sections.map((section) => (
        <section key={section.name} className={a.section}>
          <div>
            <h2 className={a.h2}>{section.name === 'Math' ? 'Math' : 'Reading & Writing'}</h2>
            <p className={a.help}>{section.units.length} official curriculum units</p>
          </div>

          <Table style={{ fontSize: '0.86rem' }}>
            <thead>
              <tr>
                <Th style={{ width: '5rem' }}>Order</Th>
                <Th>Unit</Th>
                <Th style={{ width: '8rem' }}>Expected time</Th>
                <Th style={{ width: '8rem' }}>Mastery bar</Th>
                <Th style={{ width: '1%' }}></Th>
              </tr>
            </thead>
            <tbody>
              {section.units.map((unit, index) => (
                <UnitRow
                  key={unit.id}
                  unit={unit}
                  isFirst={index === 0}
                  isLast={index === section.units.length - 1}
                  editing={editingId === unit.id}
                  values={editValues}
                  pending={pending}
                  onValues={setEditValues}
                  onEdit={() => startEdit(unit)}
                  onCancel={() => {
                    setEditingId(null);
                    setEditValues(EMPTY_VALUES);
                  }}
                  onSave={() => saveUnit(unit)}
                  onMove={(direction) =>
                    runAction(
                      () => moveCurriculumUnit({ unitId: unit.id, direction }),
                      (result) => (result.data.moved ? 'Syllabus order updated.' : 'Already at the end of this section.'),
                    )
                  }
                />
              ))}
            </tbody>
          </Table>
        </section>
      ))}

      {confirmDialog}
    </>
  );
}

function UnitRow({
  unit,
  isFirst,
  isLast,
  editing,
  values,
  pending,
  onValues,
  onEdit,
  onCancel,
  onSave,
  onMove,
}: {
  unit: CurriculumUnitSettingsRow;
  isFirst: boolean;
  isLast: boolean;
  editing: boolean;
  values: EditValues;
  pending: boolean;
  onValues: (values: EditValues) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onMove: (direction: 'up' | 'down') => void;
}) {
  if (editing) {
    return (
      <tr>
        <Td colSpan={5}>
          <form
            className={f.form}
            onSubmit={(event) => {
              event.preventDefault();
              onSave();
            }}
          >
            <div>
              <h3 className={a.sectionLabel}>Edit {unit.skillName}</h3>
              <p className={f.formHint} style={{ margin: '4px 0 0' }}>
                {unit.domainName} · <code>{unit.skillCode}</code>. Section, domain, skill code, and title
                remain read-only taxonomy identity.
              </p>
            </div>
            <div className={f.grid}>
              <label className={f.label}>
                <span className={f.labelText}>Expected minutes</span>
                <input
                  className={f.inputNarrow}
                  type="number"
                  min={1}
                  step={1}
                  value={values.expectedMinutes}
                  onChange={(event) => onValues({ ...values, expectedMinutes: event.target.value })}
                  disabled={pending}
                  required
                />
                <span className={f.formHint}>Planning estimate for a lesson task in this unit.</span>
              </label>
              <label className={f.label}>
                <span className={f.labelText}>Mastery threshold</span>
                <input
                  className={f.inputNarrow}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={values.masteryThreshold}
                  onChange={(event) => onValues({ ...values, masteryThreshold: event.target.value })}
                  disabled={pending}
                  required
                />
                <span className={f.formHint}>0–100 on the Studyworks mastery scale.</span>
              </label>
            </div>
            <div className={f.actions}>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? 'Saving…' : 'Save settings'}
              </Button>
              <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
                Cancel
              </Button>
            </div>
          </form>
        </Td>
      </tr>
    );
  }

  return (
    <tr>
      <Td style={{ whiteSpace: 'nowrap', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
        {unit.sequence}
        <div style={S.moveGroup}>
          <button
            type="button"
            style={S.moveButton}
            onClick={() => onMove('up')}
            disabled={pending || isFirst}
            aria-label={`Move ${unit.skillName} earlier`}
            title="Move earlier within this section"
          >
            &uarr;
          </button>
          <button
            type="button"
            style={S.moveButton}
            onClick={() => onMove('down')}
            disabled={pending || isLast}
            aria-label={`Move ${unit.skillName} later`}
            title="Move later within this section"
          >
            &darr;
          </button>
        </div>
      </Td>
      <Td style={{ verticalAlign: 'top' }}>
        <div style={{ fontWeight: 600 }}>{unit.title}</div>
        <div className={f.muted}>
          {unit.domainName} · <code>{unit.skillCode}</code>
        </div>
      </Td>
      <Td style={{ verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
        <strong>{unit.expectedMinutes}</strong> min
        <div className={f.muted}>New lesson tasks</div>
      </Td>
      <Td style={{ verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
        <strong>{unit.masteryThreshold}</strong> / 100
        <div className={f.muted}>Coverage + priority</div>
      </Td>
      <Td style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        <Button size="sm" variant="secondary" onClick={onEdit} disabled={pending}>
          Edit
        </Button>
      </Td>
    </tr>
  );
}

const S: Record<string, React.CSSProperties> = {
  moveGroup: {
    display: 'flex',
    gap: 2,
    marginTop: 4,
  },
  moveButton: {
    border: '1px solid var(--border-strong)',
    background: 'var(--bg-white)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    fontSize: '0.7rem',
    lineHeight: 1,
    padding: '3px 6px',
  },
};
