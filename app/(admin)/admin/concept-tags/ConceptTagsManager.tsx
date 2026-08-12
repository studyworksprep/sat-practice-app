// Client island for the concept-tag catalog table: search/sort over
// the server-loaded list, inline rename, delete with confirm, and a
// per-row merge panel. Mutations go through the colocated Server
// Actions; after each success the row data is refetched via
// router.refresh() rather than mirrored locally, so counts stay
// consistent with what the merge/delete actually did.

'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Table, Th, Td } from '@/lib/ui/Table';
import { Button } from '@/lib/ui/Button';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import type { ActionResult } from '@/lib/types';
import { renameConceptTag, deleteConceptTag, mergeConceptTags } from './actions';
import f from '../../forms.module.css';

export interface TagRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  questionCount: number;
}

type SortKey = 'name' | 'count' | 'updated';

const plural = (n: number) => (n === 1 ? '' : 's');

export function ConceptTagsManager({ tags }: { tags: TagRow[] }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;
    const sorted = [...filtered];
    if (sort === 'count') {
      sorted.sort((x, y) => y.questionCount - x.questionCount || x.name.localeCompare(y.name));
    } else if (sort === 'updated') {
      sorted.sort((x, y) => y.updated_at.localeCompare(x.updated_at));
    } else {
      sorted.sort((x, y) => x.name.localeCompare(y.name));
    }
    return sorted;
  }, [tags, query, sort]);

  /** Run one mutation: surface its error inline, or reset row state,
   *  show the success notice, and refetch the table. */
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
      setEditingId(null);
      setMergeSourceId(null);
      setMergeTargetId('');
      router.refresh();
    });
  }

  function saveRename(tag: TagRow) {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === tag.name) {
      setEditingId(null);
      return;
    }
    runAction(
      () => renameConceptTag({ tagId: tag.id, name: trimmed }),
      (res) => `Renamed “${tag.name}” to “${res.data.tag.name}”.`,
    );
  }

  async function handleDelete(tag: TagRow) {
    const ok = await confirm({
      title: `Delete tag “${tag.name}”?`,
      body:
        tag.questionCount > 0
          ? `It will be removed from ${tag.questionCount} question${plural(tag.questionCount)}. This cannot be undone.`
          : 'This tag is not on any questions. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    runAction(
      () => deleteConceptTag({ tagId: tag.id }),
      (res) =>
        `Deleted “${res.data.name}” (removed from ${res.data.removedLinks} question${plural(res.data.removedLinks)}).`,
    );
  }

  async function handleMerge(source: TagRow) {
    const target = tags.find((t) => t.id === mergeTargetId);
    if (!target) return;
    const ok = await confirm({
      title: `Merge “${source.name}” into “${target.name}”?`,
      body: `${source.questionCount} question link${plural(source.questionCount)} will move to “${target.name}”, then “${source.name}” will be deleted. This cannot be undone.`,
      confirmLabel: 'Merge',
      tone: 'danger',
    });
    if (!ok) return;
    runAction(
      () => mergeConceptTags({ sourceTagId: source.id, targetTagId: target.id }),
      (res) =>
        `Merged “${res.data.merge.source_name}” into “${res.data.merge.target_name}” — ${res.data.merge.moved} link${plural(res.data.merge.moved)} moved, ${res.data.merge.skipped_duplicates} already tagged.`,
    );
  }

  function sortHeaderProps(key: SortKey, style?: React.CSSProperties) {
    return {
      onClick: () => setSort(key),
      style: {
        cursor: 'pointer',
        textDecoration: sort === key ? 'underline' : undefined,
        ...style,
      },
      title: `Sort by ${key}`,
    };
  }

  const mergeTargets = useMemo(
    () =>
      [...tags]
        .filter((t) => t.id !== mergeSourceId)
        .sort((x, y) => x.name.localeCompare(y.name)),
    [tags, mergeSourceId],
  );

  return (
    <div>
      <div className={f.row} style={{ marginBottom: 'var(--s2)' }}>
        <input
          className={f.input}
          style={{ maxWidth: 280 }}
          type="search"
          placeholder="Filter tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter tags"
        />
        <span className={f.muted}>
          {visible.length === tags.length
            ? `${tags.length} tag${plural(tags.length)}`
            : `${visible.length} of ${tags.length} tag${plural(tags.length)}`}
        </span>
      </div>

      {notice && (
        <p className={notice.kind === 'ok' ? f.ok : f.err} role="status">
          {notice.text}
        </p>
      )}

      <Table style={{ fontSize: '0.9rem' }}>
        <thead>
          <tr>
            <Th {...sortHeaderProps('name')}>Name</Th>
            <Th {...sortHeaderProps('count', { textAlign: 'right' })}>Questions</Th>
            <Th {...sortHeaderProps('updated')}>Updated</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <Td colSpan={4} className={f.empty}>
                {tags.length === 0 ? 'No concept tags yet.' : 'No tags match the filter.'}
              </Td>
            </tr>
          )}
          {visible.map((tag) => (
            <TagTableRow
              key={tag.id}
              tag={tag}
              pending={pending}
              editing={editingId === tag.id}
              editValue={editValue}
              onEditValue={setEditValue}
              onStartRename={() => {
                setEditingId(tag.id);
                setEditValue(tag.name);
                setMergeSourceId(null);
              }}
              onCancelRename={() => setEditingId(null)}
              onSaveRename={() => saveRename(tag)}
              merging={mergeSourceId === tag.id}
              mergeTargets={mergeTargets}
              mergeTargetId={mergeTargetId}
              onMergeTargetId={setMergeTargetId}
              onToggleMerge={() => {
                setMergeSourceId(mergeSourceId === tag.id ? null : tag.id);
                setMergeTargetId('');
                setEditingId(null);
              }}
              onMerge={() => handleMerge(tag)}
              onDelete={() => handleDelete(tag)}
            />
          ))}
        </tbody>
      </Table>

      {confirmDialog}
    </div>
  );
}

function TagTableRow({
  tag,
  pending,
  editing,
  editValue,
  onEditValue,
  onStartRename,
  onCancelRename,
  onSaveRename,
  merging,
  mergeTargets,
  mergeTargetId,
  onMergeTargetId,
  onToggleMerge,
  onMerge,
  onDelete,
}: {
  tag: TagRow;
  pending: boolean;
  editing: boolean;
  editValue: string;
  onEditValue: (v: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSaveRename: () => void;
  merging: boolean;
  mergeTargets: TagRow[];
  mergeTargetId: string;
  onMergeTargetId: (v: string) => void;
  onToggleMerge: () => void;
  onMerge: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr>
        <Td>
          {editing ? (
            <input
              className={f.input}
              value={editValue}
              onChange={(e) => onEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveRename();
                if (e.key === 'Escape') onCancelRename();
              }}
              disabled={pending}
              autoFocus
              aria-label={`New name for ${tag.name}`}
            />
          ) : (
            tag.name
          )}
        </Td>
        <Td style={{ textAlign: 'right' }}>{tag.questionCount.toLocaleString()}</Td>
        {/* ISO date slice, not toLocaleDateString: locale output can
            differ between the SSR pass and hydration. */}
        <Td className={f.tdMuted}>{tag.updated_at.slice(0, 10)}</Td>
        <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {editing ? (
            <>
              <Button size="sm" variant="primary" onClick={onSaveRename} disabled={pending}>
                Save
              </Button>{' '}
              <Button size="sm" variant="secondary" onClick={onCancelRename} disabled={pending}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={onStartRename} disabled={pending}>
                Rename
              </Button>{' '}
              <Button size="sm" variant="secondary" onClick={onToggleMerge} disabled={pending}>
                {merging ? 'Close' : 'Merge…'}
              </Button>{' '}
              <Button size="sm" variant="danger" onClick={onDelete} disabled={pending}>
                Delete
              </Button>
            </>
          )}
        </Td>
      </tr>
      {merging && (
        <tr>
          <Td colSpan={4}>
            <div className={f.row}>
              <span className={f.labelText}>Merge “{tag.name}” into:</span>
              <select
                className={f.select}
                style={{ maxWidth: 320 }}
                value={mergeTargetId}
                onChange={(e) => onMergeTargetId(e.target.value)}
                disabled={pending}
                aria-label={`Merge target for ${tag.name}`}
              >
                <option value="">Choose a tag…</option>
                {mergeTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.questionCount})
                  </option>
                ))}
              </select>
              <Button size="sm" variant="primary" onClick={onMerge} disabled={pending || !mergeTargetId}>
                Merge
              </Button>
              <span className={f.muted}>
                Its questions get the surviving tag; “{tag.name}” is deleted.
              </span>
            </div>
          </Td>
        </tr>
      )}
    </>
  );
}
