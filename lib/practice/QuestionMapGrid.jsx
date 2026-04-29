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
 */
export function QuestionMapGrid({ groups, selectedId, onSelect, revealed = null }) {
  return (
    <div className={s.mapModules}>
      {groups.map((group) => (
        <div key={group.key} className={s.mapModule}>
          <div className={s.mapModuleLabel}>
            {typeof group.label === 'string' ? (
              <span className={s.mapModuleSubject}>{group.label}</span>
            ) : (
              group.label
            )}
            {group.countNote && (
              <span className={s.mapModuleCount}>{group.countNote}</span>
            )}
          </div>
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
                    <BookmarkIcon filled size={10} className={s.mapFlag} />
                  )}
                  {it.status === 'correct' && (
                    <span className={s.mapStatusCorrect} aria-hidden="true">
                      <CorrectIcon size={16} />
                    </span>
                  )}
                  {it.status === 'incorrect' && (
                    <span className={s.mapStatusWrong} aria-hidden="true">
                      <IncorrectIcon size={16} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
