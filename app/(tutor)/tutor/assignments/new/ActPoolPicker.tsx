'use client';

// Step 3 for an ACT question set: categories under their section
// (a category takes all its questions, or pick subcategories inside
// it). Questions are sampled evenly across the picks.

import { actSelectionKey as actKey, type ActSectionTaxonomy } from '@/lib/practice/act-assignment-taxonomy';
import styles from './NewAssignmentInteractive.module.css';

export function ActPoolPicker({
  taxonomy,
  selected,
  onToggle,
  onSectionAll,
  prefillLabel,
}: {
  taxonomy: ActSectionTaxonomy[];
  selected: Set<string>;
  onToggle: (section: string, category: string, subcategory?: string) => void;
  onSectionAll: (sec: ActSectionTaxonomy, on: boolean) => void;
  prefillLabel: string | null;
}) {
  if (taxonomy.length === 0) return <p className={styles.empty}>No ACT questions in the bank yet.</p>;
  return (
    <>
      {prefillLabel && selected.size > 0 && (
        <p className={styles.prefillBanner}>
          Prefilled from <strong>{prefillLabel}</strong> — adjust freely before creating.
        </p>
      )}
      <div className={styles.sectionCols}>
        {taxonomy.map((sec) => {
          const allOn = sec.categories.every((c) => selected.has(actKey(sec.section, c.name)));
          return (
            <div key={sec.section} className={styles.domainGroup}>
              <div className={styles.domainHeader}>
                <span className={styles.sectionColTitle}>{sec.label}</span>
                <button type="button" className={styles.domainAddAll} onClick={() => onSectionAll(sec, !allOn)}>
                  {allOn ? 'Clear' : 'Select all'}
                </button>
              </div>
              {sec.categories.map((c) => {
                const key = actKey(sec.section, c.name);
                const on = selected.has(key);
                return (
                  <div key={key}>
                    <label className={on ? `${styles.skillCheck} ${styles.skillCheckOn}` : styles.skillCheck}>
                      <input type="checkbox" checked={on} onChange={() => onToggle(sec.section, c.name)} />
                      <span className={styles.skillCheckName}>{c.name}</span>
                      <span className={styles.skillCheckCount}>{c.count}</span>
                    </label>
                    {c.subcategories.length > 0 && (
                      <div className={styles.actSubcategories}>
                        {c.subcategories.map((sub) => {
                          const subOn = on || selected.has(actKey(sec.section, c.name, sub.name));
                          return (
                            <label key={sub.name} className={subOn ? `${styles.skillCheck} ${styles.skillCheckOn}` : styles.skillCheck}>
                              <input
                                type="checkbox"
                                checked={subOn}
                                disabled={on}
                                onChange={() => onToggle(sec.section, c.name, sub.name)}
                              />
                              <span className={styles.skillCheckName}>{sub.name}</span>
                              <span className={styles.skillCheckCount}>{sub.count}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
