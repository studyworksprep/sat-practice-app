// Client island for the pattern catalog: filter, create, edit,
// reorder, delete — grouped by the skill each pattern hangs off.
//
// Grouping is the point. A pattern only means something as one step in
// a skill's teaching order, so the table is a set of per-skill lists in
// sequence order, not one flat table sorted by name.
//
// Mutations go through the colocated Server Actions and the list is
// refetched via router.refresh() rather than mirrored locally, so the
// order shown is the order the database will hand the students.

'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Table, Th, Td } from '@/lib/ui/Table';
import { Button } from '@/lib/ui/Button';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import type { ActionResult } from '@/lib/types';
import {
  createQuestionPattern,
  updateQuestionPattern,
  deleteQuestionPattern,
  moveQuestionPattern,
} from './actions';
import { PatternForm, EMPTY_PATTERN_FORM, type PatternFormValues } from './PatternForm';
import f from '../../../forms.module.css';
import a from '../../../admin.module.css';

export interface PatternRow {
  id: string;
  test_type: string;
  domain_code: string;
  skill_code: string;
  name: string;
  recognition_cue: string;
  process_summary: string | null;
  sequence: number;
  updated_at: string | null;
  questionCount: number;
  lessonCount: number;
}

export interface SkillGroup {
  domainCode: string;
  domainName: string;
  skillCode: string;
  skillName: string;
  section: 'Math' | 'R&W';
  patterns: PatternRow[];
}

const plural = (n: number) => (n === 1 ? '' : 's');

export function PatternCatalogManager({
  groups,
  initialSkill,
  initialDomain,
}: {
  groups: SkillGroup[];
  initialSkill: string;
  /** Domain owning initialSkill, resolved server-side from the taxonomy. */
  initialDomain: string;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [pending, startTransition] = useTransition();

  // Arriving from the units worklist for a skill with no patterns yet
  // ("add" in its Patterns column) should land in the create form
  // scoped to that skill, not on an empty filter result.
  const emptyScopedSkill =
    initialSkill !== '' &&
    initialDomain !== '' &&
    !groups.some((g) => g.skillCode === initialSkill);

  const [query, setQuery] = useState(emptyScopedSkill ? '' : initialSkill);
  const [creating, setCreating] = useState(emptyScopedSkill);
  const [createValues, setCreateValues] = useState<PatternFormValues>(
    emptyScopedSkill
      ? { ...EMPTY_PATTERN_FORM, domainCode: initialDomain, skillCode: initialSkill }
      : EMPTY_PATTERN_FORM,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<PatternFormValues>(EMPTY_PATTERN_FORM);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => {
        // A matching skill keeps all its patterns; otherwise filter
        // down to the patterns that match on their own text.
        const skillMatches =
          g.skillCode.toLowerCase().includes(q) ||
          g.skillName.toLowerCase().includes(q) ||
          g.domainName.toLowerCase().includes(q);
        if (skillMatches) return g;
        const patterns = g.patterns.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.recognition_cue.toLowerCase().includes(q) ||
            (p.process_summary ?? '').toLowerCase().includes(q),
        );
        return patterns.length > 0 ? { ...g, patterns } : null;
      })
      .filter((g): g is SkillGroup => g !== null);
  }, [groups, query]);

  const totalPatterns = groups.reduce((n, g) => n + g.patterns.length, 0);
  const shownPatterns = visible.reduce((n, g) => n + g.patterns.length, 0);

  function runAction<T extends Record<string, unknown>>(
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
      setCreateValues(EMPTY_PATTERN_FORM);
      setEditingId(null);
      router.refresh();
    });
  }

  function startEdit(pattern: PatternRow) {
    setEditingId(pattern.id);
    setCreating(false);
    setEditValues({
      domainCode: pattern.domain_code,
      skillCode: pattern.skill_code,
      name: pattern.name,
      recognitionCue: pattern.recognition_cue,
      processSummary: pattern.process_summary ?? '',
      sequence: String(pattern.sequence),
    });
  }

  async function handleDelete(pattern: PatternRow) {
    const consequences: string[] = [];
    if (pattern.questionCount > 0) {
      consequences.push(
        `${pattern.questionCount} question${plural(pattern.questionCount)} will go back to unclassified`,
      );
    }
    if (pattern.lessonCount > 0) {
      consequences.push(
        `${pattern.lessonCount} lesson scope tag${plural(pattern.lessonCount)} will be removed`,
      );
    }
    const ok = await confirm({
      title: `Delete “${pattern.name}”?`,
      body:
        consequences.length > 0
          ? `${consequences.join(' and ')}. The questions and lessons themselves are not deleted. This cannot be undone.`
          : 'Nothing is tagged with this pattern yet. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    runAction(
      () => deleteQuestionPattern({ patternId: pattern.id }),
      (res) =>
        `Deleted “${res.data.name}” — ${res.data.questions} question${plural(res.data.questions)} unclassified, ${res.data.lessonTags} lesson tag${plural(res.data.lessonTags)} removed.`,
    );
  }

  return (
    <div>
      <div className={f.row} style={{ marginBottom: 'var(--s2, 0.5rem)' }}>
        <input
          className={f.input}
          style={{ maxWidth: 320 }}
          type="search"
          placeholder="Filter by skill, pattern, or cue…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter patterns"
        />
        <span className={f.muted}>
          {shownPatterns === totalPatterns
            ? `${totalPatterns} pattern${plural(totalPatterns)} across ${groups.length} skill${plural(groups.length)}`
            : `${shownPatterns} of ${totalPatterns} pattern${plural(totalPatterns)}`}
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
            {creating ? 'Close' : '+ New pattern'}
          </Button>
        </span>
      </div>

      {creating && (
        <div className={f.fieldset} style={{ marginBottom: '1rem' }}>
          <h3 className={a.sectionLabel}>New pattern</h3>
          <PatternForm
            values={createValues}
            onChange={setCreateValues}
            onSubmit={() =>
              runAction(
                () => createQuestionPattern(createValues),
                (res) => `Created “${res.data.name}”.`,
              )
            }
            onCancel={() => {
              setCreating(false);
              setCreateValues(EMPTY_PATTERN_FORM);
            }}
            pending={pending}
            submitLabel="Create pattern"
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
          {totalPatterns === 0
            ? 'No patterns yet. Add one above, or import a drafted catalog from a spreadsheet.'
            : 'No patterns match the filter.'}
        </p>
      )}

      {visible.map((group) => (
        <section key={`${group.domainCode}-${group.skillCode}`} className={a.section}>
          <div style={S.groupHead}>
            <div>
              <h2 className={a.h2}>
                {group.skillName} <code style={S.code}>{group.skillCode}</code>
              </h2>
              <div className={f.muted}>
                {group.section} · {group.domainName} · {group.patterns.length} pattern
                {plural(group.patterns.length)}
              </div>
            </div>
            <Link
              href={`/admin/lessons/generate?skill=${encodeURIComponent(group.skillCode)}`}
              className={a.link}
            >
              Generate skill lesson &rarr;
            </Link>
          </div>

          <Table style={{ fontSize: '0.86rem' }}>
            <thead>
              <tr>
                <Th style={{ width: '3.5rem' }}>Order</Th>
                <Th>Pattern</Th>
                <Th style={{ textAlign: 'right', width: '5rem' }}>Questions</Th>
                <Th style={{ textAlign: 'right', width: '4.5rem' }}>Lessons</Th>
                <Th style={{ width: '1%' }}></Th>
              </tr>
            </thead>
            <tbody>
              {group.patterns.map((pattern, index) => (
                <PatternTableRow
                  key={pattern.id}
                  pattern={pattern}
                  isFirst={index === 0}
                  isLast={index === group.patterns.length - 1}
                  pending={pending}
                  editing={editingId === pattern.id}
                  editValues={editValues}
                  onEditValues={setEditValues}
                  onStartEdit={() => startEdit(pattern)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={() =>
                    runAction(
                      () => updateQuestionPattern({ ...editValues, patternId: pattern.id }),
                      (res) => `Saved “${res.data.name}”.`,
                    )
                  }
                  onMove={(direction) =>
                    runAction(
                      () => moveQuestionPattern({ patternId: pattern.id, direction }),
                      (res) => (res.data.moved ? 'Reordered.' : 'Already at the end.'),
                    )
                  }
                  onDelete={() => handleDelete(pattern)}
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

function PatternTableRow({
  pattern,
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
  pattern: PatternRow;
  isFirst: boolean;
  isLast: boolean;
  pending: boolean;
  editing: boolean;
  editValues: PatternFormValues;
  onEditValues: (v: PatternFormValues) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onDelete: () => void;
}) {
  if (editing) {
    return (
      <tr>
        <Td colSpan={5}>
          <h3 className={a.sectionLabel}>Edit pattern</h3>
          <PatternForm
            values={editValues}
            onChange={onEditValues}
            onSubmit={onSaveEdit}
            onCancel={onCancelEdit}
            pending={pending}
            submitLabel="Save changes"
            sequenceHint="Position within the skill. Blank moves it to the end."
          />
        </Td>
      </tr>
    );
  }

  return (
    <tr>
      <Td style={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
        {pattern.sequence}
        <div style={S.moveGroup}>
          <button
            type="button"
            style={S.moveButton}
            onClick={() => onMove('up')}
            disabled={pending || isFirst}
            aria-label={`Move ${pattern.name} earlier`}
            title="Move earlier"
          >
            &uarr;
          </button>
          <button
            type="button"
            style={S.moveButton}
            onClick={() => onMove('down')}
            disabled={pending || isLast}
            aria-label={`Move ${pattern.name} later`}
            title="Move later"
          >
            &darr;
          </button>
        </div>
      </Td>
      <Td style={{ verticalAlign: 'top' }}>
        <div style={{ fontWeight: 600 }}>{pattern.name}</div>
        <div style={S.cue}>{pattern.recognition_cue}</div>
        {pattern.process_summary && <div className={f.tdMuted}>{pattern.process_summary}</div>}
      </Td>
      <Td style={{ textAlign: 'right', verticalAlign: 'top' }}>
        {pattern.questionCount > 0 ? (
          <Link
            href={`/admin/questions?pattern=${encodeURIComponent(pattern.id)}`}
            className={a.link}
          >
            {pattern.questionCount.toLocaleString()}
          </Link>
        ) : (
          <span className={f.muted}>0</span>
        )}
      </Td>
      <Td style={{ textAlign: 'right', verticalAlign: 'top' }}>
        {pattern.lessonCount > 0 ? (
          pattern.lessonCount.toLocaleString()
        ) : (
          <span className={f.muted}>0</span>
        )}
      </Td>
      <Td style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        {/* The generate page already prefills cue + process from
            ?pattern= (lib/admin/lessonBriefPrefill) — this is the link
            that finally reaches it. */}
        <Button
          size="sm"
          variant="secondary"
          href={`/admin/lessons/generate?pattern=${encodeURIComponent(pattern.id)}`}
        >
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
  groupHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
    marginBottom: '0.75rem',
  },
  code: {
    fontSize: '0.78rem',
    fontWeight: 500,
    color: 'var(--fg3, #6b7280)',
  },
  cue: {
    fontSize: '0.84rem',
    color: '#374151',
    marginTop: 2,
  },
  moveGroup: {
    display: 'flex',
    gap: 2,
    marginTop: 4,
  },
  moveButton: {
    border: '1px solid #d1d5db',
    background: 'white',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: '0.7rem',
    lineHeight: 1,
    padding: '2px 5px',
  },
};
