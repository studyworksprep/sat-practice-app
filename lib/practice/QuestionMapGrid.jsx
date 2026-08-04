// Shared question-map grid for the report-style review surfaces
// (the practice-test results page and the tutor assignment
// report). Each cell is a clickable button that selects a
// question for the inline detail view. Cells render in a uniform
// difficulty-tinted style with a corner status icon for correct
// / incorrect, a slate fill for unanswered, and a small dot
// over the corner once revealed.
//
// Items can optionally be grouped — practice-test reports group
// by subject + module; assignment reports group by domain. The
// grouping is provided by the caller (groups: [{key, label,
// items[]}]) so this file stays free of subject/module/domain
// vocabulary.
//
// CSS class names mirror the practice-test report's mapItem /
// mapGrid / mapModule classes. They were copy-pasted on the
// first migration; the scoped CSS module here is the canonical
// home and the test report should switch to importing this
// component in a follow-up.

'use client';

import { BookmarkIcon, CorrectIcon, IncorrectIcon } from '@/lib/ui/icons';
import s from './QuestionMapGrid.module.css';

const DIFF_CLASS = {
  1: 'diffEasy',
  2: 'diffMed',
  3: 'diffHard',
  4: 'diffVHard',
  5: 'diffExtreme',
};

/**
 * @param {object} props
 * @param {Array<{
 *   key: string,
 *   label: React.ReactNode,
 *   countNote?: string,
 *   column?: string,
 *   items: Array<{
 *     id: string | number,
 *     ordinalLabel: string | number,
 *     status: 'correct' | 'incorrect' | 'unanswered',
 *     difficulty?: number | null,
 *     missing?: boolean,
 *     ariaLabel?: string,
 *   }>
 * }>} props.groups
 * @param {string | number | null} props.selectedId
 * @param {(id: string | number) => void} props.onSelect
 * @param {Set<string | number>} [props.revealed]
 * @param {boolean} [props.dense] - compact layout for large item
 *   counts (a full practice test is 98 questions): ~22px cells,
 *   groups flowing horizontally instead of stacking. Callers with
 *   assignment-sized maps (~30-40 questions) keep the default.
 *   Groups carrying a `column` key (e.g. subject) are stacked into
 *   one column per key — a full test reads as an RW column (M1
 *   over M2) beside a Math column — instead of free-flow wrapping.
 */
export function QuestionMapGrid({ groups, selectedId, onSelect, revealed = null, dense = false }) {
  // Dense: bucket groups into columns by their `column` key (groups
  // without one stand alone), then let the columns share the full
  // width. Insertion order of both columns and groups is preserved.
  // data-cols drives the container's track count so a single-column
  // map (e.g. a 50-question assignment, one ungrouped bucket) spans
  // the whole width instead of sitting in one narrow track.
  if (dense) {
    const columns = [];
    const byKey = new Map();
    for (const g of groups) {
      const key = g.column ?? g.key;
      if (!byKey.has(key)) {
        const bucket = [];
        byKey.set(key, bucket);
        columns.push({ key, groups: bucket });
      }
      byKey.get(key).push(g);
    }
    return (
      <div
        className={`${s.mapModules} ${s.mapModulesDense}`}
        data-cols={columns.length === 1 ? '1' : undefined}
      >
        {columns.map((col) => (
          <div key={col.key} className={s.mapColumn}>
            {col.groups.map((group) => renderGroup(group, { selectedId, onSelect, revealed, dense }))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={s.mapModules}>
      {groups.map((group) => renderGroup(group, { selectedId, onSelect, revealed, dense }))}
    </div>
  );
}

function renderGroup(group, { selectedId, onSelect, revealed, dense }) {
  return (
    <MapGroup
      key={group.key}
      group={group}
      selectedId={selectedId}
      onSelect={onSelect}
      revealed={revealed}
      dense={dense}
    />
  );
}

function MapGroup({ group, selectedId, onSelect, revealed, dense }) {
  // Empty string / null suppresses the label row entirely so
  // ungrouped callers (e.g. ReviewInteractive's single-group
  // map) don't render a hollow header strip above the grid.
  const hasLabel = group.label != null && group.label !== '';
  const hasCount = !!group.countNote;
  return (
        <div className={s.mapModule}>
          {(hasLabel || hasCount) && (
            <div className={s.mapModuleLabel}>
              {hasLabel && (typeof group.label === 'string' ? (
                <span className={s.mapModuleSubject}>{group.label}</span>
              ) : (
                group.label
              ))}
              {hasCount && (
                <span className={s.mapModuleCount}>{group.countNote}</span>
              )}
            </div>
          )}
          <div className={s.mapGrid} role="list">
            {group.items.map((it) => {
              const diffCls = it.difficulty != null
                ? DIFF_CLASS[it.difficulty]
                : null;
              const isCurrent = it.id === selectedId;
              const isRevealed = revealed?.has(it.id) ?? false;
              const cls = [
                s.mapItem,
                diffCls ? s[diffCls] : null,
                isCurrent ? s.mapItemActive : null,
                it.status === 'unanswered' ? s.mapItemUnanswered : null,
                isRevealed ? s.mapItemRevealed : null,
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={it.id}
                  type="button"
                  className={cls}
                  onClick={() => onSelect(it.id)}
                  aria-label={it.ariaLabel ?? `Question ${it.ordinalLabel}, ${it.status}`}
                >
                  <span className={s.mapNum}>{it.ordinalLabel}</span>
                  {it.marked && (
                    <BookmarkIcon filled size={dense ? 8 : 10} className={s.mapFlag} />
                  )}
                  {it.status === 'correct' && (
                    <span className={s.mapStatusCorrect} aria-hidden="true">
                      <CorrectIcon size={dense ? 10 : 16} />
                    </span>
                  )}
                  {it.status === 'incorrect' && (
                    <span className={s.mapStatusWrong} aria-hidden="true">
                      <IncorrectIcon size={dense ? 10 : 16} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
  );
}
