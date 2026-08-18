import { getLessonScopeLabels, type LessonCatalogItem } from '@/lib/lesson/catalog';
import styles from './LessonScopeChips.module.css';

interface Props {
  lesson: LessonCatalogItem;
  max?: number;
  includeKind?: boolean;
}

export function LessonScopeChips({ lesson, max = 4, includeKind = false }: Props) {
  const labels = getLessonScopeLabels(lesson);
  const visible = labels.slice(0, max);
  const hiddenCount = labels.length - visible.length;

  return (
    <div className={styles.chips} aria-label="Lesson curriculum scope">
      {includeKind && lesson.kind === 'foundation' && (
        <span className={styles.kind}>Foundation</span>
      )}
      {visible.map((label) => (
        <span
          key={label}
          className={label === 'Uncategorized' ? styles.uncategorized : styles.chip}
        >
          {label}
        </span>
      ))}
      {hiddenCount > 0 && <span className={styles.more}>+{hiddenCount}</span>}
    </div>
  );
}
