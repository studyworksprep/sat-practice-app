// Client island for the Techniques catalog: filter, create, edit,
// reorder, delete — grouped by section (Math, Reading & Writing, both).
//
// Mutations go through the colocated Server Actions and the list is
// refetched via router.refresh() rather than mirrored locally, so the
// order shown is the order every picker will offer.

'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Table, Th, Td } from '@/lib/ui/Table';
import { Button } from '@/lib/ui/Button';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import { describeDefaultSkills, sectionLabel, type TechniqueSection } from '@/lib/admin/techniques';
import type { ActionResult } from '@/lib/types';
import { createTechnique, updateTechnique, deleteTechnique, moveTechnique } from './actions';
import { TechniqueForm, EMPTY_TECHNIQUE_FORM, type TechniqueFormValues } from './TechniqueForm';
import f from '../../forms.module.css';
import a from '../../admin.module.css';

export interface TechniqueRow {
  id: string;
  name: string;
  description: string;
  process_summary: string | null;
  section: TechniqueSection | null;
  sequence: number;
  skillCodes: string[];
  questionCount: number;
  lessonCount: number;
  stepCount: number;
}

export interface SectionGroup {
  section: TechniqueSection | null;
  techniques: TechniqueRow[];
}

const plural = (n: number) => (n === 1 ? '' : 's');

export function TechniqueCatalogManager({
  groups,
  startCreating = false,
}: {
  groups: SectionGroup[];
  startCreating?: boolean;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(startCreating);
  const [createValues, setCreateValues] = useState<TechniqueFormValues>(EMPTY_TECHNIQUE_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<TechniqueFormValues>(EMPTY_TECHNIQUE_FORM);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        techniques: g.techniques.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            (t.process_summary ?? '').toLowerCase().includes(q) ||
            describeDefaultSkills(t.skillCodes).toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.techniques.length > 0);
  }, [groups, query]);

  const total = groups.reduce((n, g) => n + g.techniques.length, 0);
  const shown = visible.reduce((n, g) => n + g.techniques.length, 0);

  function run<T extends Record<string, unknown>>(
    fn: () => Promise<ActionResult<T>>,
    describe: (res: { ok: true } & T) => string,
  ) {
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setNotice({ kind: 'err', text: res.error });
        return;
      }
      setNotice({ kind: 'ok', text: describe(res) });
      setCreating(false);
      setCreateValues(EMPTY_TECHNIQUE_FORM);
      setEditingId(null);
      router.refresh();
    });
  }

  function startEdit(t: TechniqueRow) {
    setEditingId(t.id);
    setCreating(false);
    setEditValues({
      name: t.name,
      description: t.description,
      processSummary: t.process_summary ?? '',
      section: t.section ?? '',
      skillCodes: t.skillCodes,
      sequence: String(t.sequence),
    });
  }

  async function handleDelete(t: TechniqueRow) {
    const costs: string[] = [];
    if (t.questionCount > 0) costs.push(`${t.questionCount} question tag${plural(t.questionCount)}`);
    if (t.lessonCount > 0) costs.push(`${t.lessonCount} lesson link${plural(t.lessonCount)}`);
    if (t.stepCount > 0) costs.push(`its use in ${t.stepCount} syllabus step${plural(t.stepCount)}`);
    const ok = await confirm({
      title: `Delete “${t.name}”?`,
      body:
        costs.length > 0
          ? `This removes ${costs.join(', ')}. The questions, lessons and steps themselves stay. This cannot be undone.`
          : 'Nothing is tagged with this technique yet. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    run(
      () => deleteTechnique({ techniqueId: t.id }),
      (res) =>
        `Deleted “${res.data.name}” — ${res.data.questions} question tag${plural(res.data.questions)}, ${res.data.lessons} lesson link${plural(res.data.lessons)}, ${res.data.steps} step${plural(res.data.steps)} updated.`,
    );
  }

  return (
    <div>
      <div className={f.row} style={{ marginBottom: 'var(--s2, 0.5rem)' }}>
        <input
          className={f.input}
          style={{ maxWidth: 320 }}
          type="search"
          placeholder="Filter by name, cue, or skill…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter techniques"
        />
        <span className={f.muted}>
          {shown === total ? `${total} technique${plural(total)}` : `${shown} of ${total} technique${plural(total)}`}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Button
            size="sm"
            variant={creating ? 'secondary' : 'primary'}
            onClick={() => {
              setCreating((v) => !v);
              setEditingId(null);
            }}
            disabled={pending}
          >
            {creating ? 'Close' : '+ New technique'}
          </Button>
        </span>
      </div>

      {creating && (
        <div className={f.fieldset} style={{ marginBottom: '1rem' }}>
          <h3 className={a.sectionLabel}>New technique</h3>
          <TechniqueForm
            values={createValues}
            onChange={setCreateValues}
            onSubmit={() => run(() => createTechnique(createValues), (res) => `Created “${res.data.name}”.`)}
            onCancel={() => {
              setCreating(false);
              setCreateValues(EMPTY_TECHNIQUE_FORM);
            }}
            pending={pending}
            submitLabel="Create technique"
          />
        </div>
      )}

      {notice && (
        <p className={notice.kind === 'ok' ? f.ok : f.err} role="status">
          {notice.text}
        </p>
      )}

      {visible.length === 0 && (
        <p className={f.empty}>
          {total === 0
            ? 'No techniques yet. Add the first one above — for example “Solve by graphing (x-intercepts)” or “Good Cop Bad Cop”.'
            : 'No techniques match the filter.'}
        </p>
      )}

      {visible.map((group) => (
        <section key={group.section ?? 'both'} className={a.section}>
          <h2 className={a.h2}>{sectionLabel(group.section)}</h2>
          <Table style={{ fontSize: '0.86rem' }}>
            <thead>
              <tr>
                <Th style={{ width: '3.5rem' }}>Order</Th>
                <Th>Technique</Th>
                <Th>Applies to</Th>
                <Th style={{ textAlign: 'right', width: '5.5rem' }}>Tagged</Th>
                <Th style={{ textAlign: 'right', width: '4.5rem' }}>Lessons</Th>
                <Th style={{ width: '1%' }}></Th>
              </tr>
            </thead>
            <tbody>
              {group.techniques.map((t, index) => (
                <TechniqueTableRow
                  key={t.id}
                  technique={t}
                  isFirst={index === 0}
                  isLast={index === group.techniques.length - 1}
                  pending={pending}
                  editing={editingId === t.id}
                  editValues={editValues}
                  onEditValues={setEditValues}
                  onStartEdit={() => startEdit(t)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={() =>
                    run(() => updateTechnique({ ...editValues, techniqueId: t.id }), (res) => `Saved “${res.data.name}”.`)
                  }
                  onMove={(direction) =>
                    run(
                      () => moveTechnique({ techniqueId: t.id, direction }),
                      (res) => (res.data.moved ? 'Reordered.' : 'Already at the end.'),
                    )
                  }
                  onDelete={() => handleDelete(t)}
                />
              ))}
            </tbody>
          </Table>
        </section>
      ))}

      {confirmDialog}
    </div>
  );
}

function TechniqueTableRow({
  technique: t,
  isFirst,
  isLast,
  pending,
  editing,
  editValues,
  onEditValues,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onMove,
  onDelete,
}: {
  technique: TechniqueRow;
  isFirst: boolean;
  isLast: boolean;
  pending: boolean;
  editing: boolean;
  editValues: TechniqueFormValues;
  onEditValues: (v: TechniqueFormValues) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onDelete: () => void;
}) {
  if (editing) {
    return (
      <tr>
        <Td colSpan={6}>
          <h3 className={a.sectionLabel}>Edit technique</h3>
          <TechniqueForm
            values={editValues}
            onChange={onEditValues}
            onSubmit={onSaveEdit}
            onCancel={onCancelEdit}
            pending={pending}
            submitLabel="Save changes"
          />
        </Td>
      </tr>
    );
  }

  return (
    <tr>
      <Td style={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
        {t.sequence}
        <div style={S.moveGroup}>
          <button type="button" style={S.moveButton} onClick={() => onMove('up')} disabled={pending || isFirst} aria-label={`Move ${t.name} earlier`} title="Move earlier">&uarr;</button>
          <button type="button" style={S.moveButton} onClick={() => onMove('down')} disabled={pending || isLast} aria-label={`Move ${t.name} later`} title="Move later">&darr;</button>
        </div>
      </Td>
      <Td style={{ verticalAlign: 'top' }}>
        <div style={{ fontWeight: 600 }}>{t.name}</div>
        <div style={S.cue}>{t.description}</div>
        {t.process_summary && <div className={f.tdMuted}>{t.process_summary}</div>}
      </Td>
      <Td style={{ verticalAlign: 'top' }}>
        <span className={t.skillCodes.length === 0 ? f.muted : undefined}>{describeDefaultSkills(t.skillCodes)}</span>
        {t.stepCount > 0 && (
          <div className={f.tdMuted}>Used by {t.stepCount} syllabus step{plural(t.stepCount)}</div>
        )}
      </Td>
      <Td style={{ textAlign: 'right', verticalAlign: 'top' }}>
        {t.questionCount > 0 ? (
          <Link href={`/admin/questions?technique=${encodeURIComponent(t.id)}`} className={a.link}>
            {t.questionCount.toLocaleString()}
          </Link>
        ) : (
          <span className={f.muted}>0</span>
        )}
      </Td>
      <Td style={{ textAlign: 'right', verticalAlign: 'top' }}>
        {t.lessonCount > 0 ? t.lessonCount.toLocaleString() : <span className={f.muted}>0</span>}
      </Td>
      <Td style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        {/* The generate page prefills cue + process from ?technique=
            (lib/admin/lessonBriefPrefill). */}
        <Button size="sm" variant="secondary" href={`/admin/lessons/generate?technique=${encodeURIComponent(t.id)}`}>
          Lesson
        </Button>{' '}
        <Button size="sm" variant="secondary" onClick={onStartEdit} disabled={pending}>
          Edit
        </Button>{' '}
        <Button size="sm" variant="danger" onClick={onDelete} disabled={pending}>
          Delete
        </Button>
      </Td>
    </tr>
  );
}

const S: Record<string, React.CSSProperties> = {
  cue: { fontSize: '0.84rem', color: '#374151', marginTop: 2 },
  moveGroup: { display: 'flex', gap: 2, marginTop: 4 },
  moveButton: { border: '1px solid #d1d5db', background: 'white', borderRadius: 4, cursor: 'pointer', fontSize: '0.7rem', lineHeight: 1, padding: '2px 5px' },
};
