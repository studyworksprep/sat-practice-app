'use client';

// Step 3 for an SAT question set: skills grouped Math | Reading &
// Writing, then domain, each skill a checkbox. Ticked skills appear
// under "Fine-tune selected skills" with their own score bands and
// weight (relative share of the set) — kept from the original picker,
// folded away so the common case is just ticking boxes.

import type { ReactNode } from 'react';
import styles from './NewAssignmentInteractive.module.css';

export type SkillTaxonomy = { name: string; scoreBands: number[]; count: number };
export type DomainTaxonomy = { name: string; skills: SkillTaxonomy[] };
export type SelectedSkill = {
  domain: string;
  skill: string;
  scoreBands: number[];
  weight: number;
  availableBands: number[];
  availableCount: number;
};

export const WEIGHT_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
export const DEFAULT_WEIGHT = 1;

// published_question_taxonomy carries domain names only.
const RW_DOMAINS = new Set([
  'Information and Ideas', 'Craft and Structure', 'Expression of Ideas', 'Standard English Conventions',
]);
export function domainSectionLabel(domain: string): 'Math' | 'Reading & Writing' {
  return RW_DOMAINS.has(domain) ? 'Reading & Writing' : 'Math';
}

export function SatSkillPicker({
  domains,
  selected,
  search,
  onSearch,
  onToggleSkill,
  onToggleDomain,
  onToggleBand,
  onWeight,
  prefillLabel,
  weaknessLink,
}: {
  domains: DomainTaxonomy[];
  selected: SelectedSkill[];
  search: string;
  onSearch: (q: string) => void;
  onToggleSkill: (domain: string, skill: SkillTaxonomy) => void;
  onToggleDomain: (domain: DomainTaxonomy, on: boolean) => void;
  onToggleBand: (domain: string, skill: string, band: number) => void;
  onWeight: (domain: string, skill: string, weight: number) => void;
  prefillLabel: string | null;
  weaknessLink: ReactNode;
}) {
  const picked = new Set(selected.map((s) => `${s.domain}|${s.skill}`));
  const q = search.trim().toLowerCase();
  const visible = q
    ? domains
        .map((d) => ({ ...d, skills: d.skills.filter((s) => s.name.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)) }))
        .filter((d) => d.skills.length > 0)
    : domains;
  const columns = (['Math', 'Reading & Writing'] as const).map((label) => ({
    label,
    domains: visible.filter((d) => domainSectionLabel(d.name) === label),
  }));

  return (
    <>
      {prefillLabel && selected.length > 0 && (
        <p className={styles.prefillBanner}>
          Prefilled from <strong>{prefillLabel}</strong> — adjust freely before creating.
        </p>
      )}
      <div className={styles.skillToolbar}>
        <label className={styles.srOnly} htmlFor="skill-filter">Filter skills</label>
        <input
          id="skill-filter"
          type="search"
          placeholder="Filter skills…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className={styles.search}
        />
        {weaknessLink}
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>No skills match.</p>
      ) : (
        <div className={styles.sectionCols}>
          {columns.map((col) => col.domains.length > 0 && (
            <div key={col.label}>
              <p className={styles.sectionColTitle}>{col.label}</p>
              {col.domains.map((d) => {
                const allOn = d.skills.every((s) => picked.has(`${d.name}|${s.name}`));
                return (
                  <div key={d.name} className={styles.domainGroup}>
                    <div className={styles.domainHeader}>
                      <span className={styles.domainName}>{d.name}</span>
                      <button type="button" className={styles.domainAddAll} onClick={() => onToggleDomain(d, !allOn)}>
                        {allOn ? 'Clear' : 'Select all'}
                      </button>
                    </div>
                    {d.skills.map((s) => {
                      const on = picked.has(`${d.name}|${s.name}`);
                      return (
                        <label key={s.name} className={on ? `${styles.skillCheck} ${styles.skillCheckOn}` : styles.skillCheck}>
                          <input type="checkbox" checked={on} onChange={() => onToggleSkill(d.name, s)} />
                          <span className={styles.skillCheckName}>{s.name}</span>
                          <span className={styles.skillCheckCount}>{s.count}</span>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <details className={styles.fineTune}>
          <summary>Fine-tune selected skills · score bands and weights</summary>
          <ul className={styles.selectedList}>
            {selected.map((s) => (
              <li key={`${s.domain}|${s.skill}`} className={styles.selectedItem}>
                <div className={styles.selectedItemTitle}>
                  <div className={styles.selectedItemSkill}>{s.skill}</div>
                  <div className={styles.selectedItemDomain}>{s.domain}</div>
                </div>
                {s.availableBands.length > 0 && (
                  <div>
                    <div className={styles.controlLabel}>Score bands{s.scoreBands.length === 0 && ' (all)'}</div>
                    <div className={styles.bandRow}>
                      {s.availableBands.map((b) => (
                        <button
                          key={b}
                          type="button"
                          aria-pressed={s.scoreBands.includes(b)}
                          className={`${styles.bandChip} ${s.scoreBands.includes(b) ? styles.bandChipActive : ''}`}
                          onClick={() => onToggleBand(s.domain, s.skill, b)}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className={styles.controlLabel}>Weight — relative share of the set</div>
                  <div className={styles.weightRow}>
                    <input
                      type="range"
                      min={0}
                      max={WEIGHT_STEPS.length - 1}
                      step={1}
                      aria-label={`Weight for ${s.skill}`}
                      value={WEIGHT_STEPS.indexOf(s.weight) === -1 ? WEIGHT_STEPS.indexOf(DEFAULT_WEIGHT) : WEIGHT_STEPS.indexOf(s.weight)}
                      onChange={(e) => onWeight(s.domain, s.skill, WEIGHT_STEPS[Number(e.target.value)])}
                      className={styles.weightSlider}
                    />
                    <span className={styles.weightValue}>{s.weight.toFixed(2).replace(/\.00$/, '')}×</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
