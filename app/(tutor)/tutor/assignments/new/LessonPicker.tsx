'use client';

import { useMemo, useState } from 'react';
import {
  filterLessonCatalog,
  sectionLabel,
  type LessonCatalogItem,
  type LessonSection,
} from '@/lib/lesson/catalog';
import { LessonScopeChips } from '@/lib/ui/LessonScopeChips';
import styles from './NewAssignmentInteractive.module.css';

interface Props {
  lessons: LessonCatalogItem[];
}

export function LessonPicker({ lessons }: Props) {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<LessonSection | ''>('');
  const [selectedId, setSelectedId] = useState('');
  const visibleLessons = useMemo(
    () => filterLessonCatalog(lessons, { q: query, section, sort: 'title' }),
    [lessons, query, section],
  );
  const selectedLesson = lessons.find((lesson) => lesson.id === selectedId) ?? null;
  const availableSections = (['reading_writing', 'math'] as LessonSection[])
    .filter((value) => lessons.some((lesson) => lesson.sections.includes(value)));

  return (
    <div className={styles.lessonPicker}>
      <input type="hidden" name="lesson_id" value={selectedId} />

      {selectedLesson && (
        <div className={styles.lessonSelection} aria-live="polite">
          <div>
            <span className={styles.lessonSelectionLabel}>Selected lesson</span>
            <strong>{selectedLesson.title}</strong>
            <LessonScopeChips lesson={selectedLesson} max={5} includeKind />
          </div>
          <button type="button" onClick={() => setSelectedId('')}>Change</button>
        </div>
      )}

      <div className={styles.lessonSearchRow}>
        <label className={styles.lessonSearchField} htmlFor="lesson_search">
          <span>Find a lesson</span>
          <input
            id="lesson_search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, description, skill, or pattern"
            autoComplete="off"
          />
        </label>
        {availableSections.length > 0 && (
          <div className={styles.lessonSectionFilters} aria-label="Filter lessons by section">
            <button
              type="button"
              className={section === '' ? styles.lessonSectionActive : ''}
              onClick={() => setSection('')}
              aria-pressed={section === ''}
            >
              All
            </button>
            {availableSections.map((value) => (
              <button
                key={value}
                type="button"
                className={section === value ? styles.lessonSectionActive : ''}
                onClick={() => setSection(value)}
                aria-pressed={section === value}
              >
                {sectionLabel(value)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.lessonResultCount} aria-live="polite">
        {visibleLessons.length} lesson{visibleLessons.length === 1 ? '' : 's'}
      </div>
      {visibleLessons.length === 0 ? (
        <p className={styles.lessonNoResults}>No lessons match this search.</p>
      ) : (
        <div className={styles.lessonOptions} aria-label="Available lessons">
          {visibleLessons.map((lesson) => {
            const selected = lesson.id === selectedId;
            return (
              <button
                key={lesson.id}
                type="button"
                aria-pressed={selected}
                aria-label={`Select lesson: ${lesson.title}`}
                className={`${styles.lessonOption} ${selected ? styles.lessonOptionSelected : ''}`}
                onClick={() => setSelectedId(lesson.id)}
              >
                <span className={styles.lessonOptionTitle}>{lesson.title}</span>
                {lesson.description && (
                  <span className={styles.lessonOptionDescription}>{lesson.description}</span>
                )}
                <LessonScopeChips lesson={lesson} max={4} includeKind />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
