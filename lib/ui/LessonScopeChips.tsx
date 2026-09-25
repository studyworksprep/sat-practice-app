// A lesson's tags as chips, for the lesson libraries (admin + tutor) and
// the assignment lesson picker. One chip per stored tag, named the way a
// person names it: the skill's name for a skill tag, the domain's for a
// domain tag, "Math section" for a section tag. Skills come first, in
// curriculum order, so the cap never hides a skill behind the section
// and domain it belongs to; hovering a chip shows its domain and code,
// and the "+N" chip names what it hides.

import { getLessonScopeChips, type LessonCatalogItem } from '@/lib/lesson/catalog';
import styles from './LessonScopeChips.module.css';

interface Props {
  lesson: LessonCatalogItem;
  max?: number;
  includeKind?: boolean;
}

export function LessonScopeChips({ lesson, max = 4, includeKind = false }: Props) {
  const chips = getLessonScopeChips(lesson);
  const visible = chips.slice(0, max);
  const hidden = chips.slice(visible.length);
  const hiddenLabels = hidden.map((chip) => chip.label);

  return (
    <div className={styles.chips} aria-label="Lesson tags">
      {includeKind && lesson.kind === 'foundation' && (
        <span className={styles.kind}>Foundation</span>
      )}
      {chips.length === 0 && <span className={styles.uncategorized}>Uncategorized</span>}
      {visible.map((chip) => (
        <span key={chip.key} className={styles.chip} title={chip.title}>
          {chip.label}
        </span>
      ))}
      {hidden.length > 0 && (
        <span className={styles.more} title={hiddenLabels.join('\n')}>
          +{hidden.length}
          <span className={styles.srOnly}> more: {hiddenLabels.join(', ')}</span>
        </span>
      )}
    </div>
  );
}
