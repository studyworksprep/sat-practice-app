// Teacher assignment-creation form. One form, three type-specific
// payload groups toggled by the selected assignment_type.
//
// Key design points:
// - For "questions" assignments, skills are picked one-at-a-time
//   into a Selected list. Each selected skill has its own
//   score-band chip selector and its own weight (relative
//   sampling share), so a tutor can say "heavy on Ratios + light
//   on Percents" instead of one global score-band for everything.
// - Difficulty is still applied assignment-wide (tutors almost
//   always want the same level across topics; a per-skill
//   difficulty control would be visually overwhelming for the
//   rare case where it's wanted).
// - The selected skills are serialized to a single hidden input
//   as JSON because the payload shape is nested; getAll('field')
//   can't represent nested objects cleanly.
//
// Client state is minimal: the working selection (which skills
// are chosen, their bands + weight), the type toggle, and the
// student checkbox set. Everything else is a plain form field.

'use client';

import { useActionState, useMemo, useState } from 'react';
import type { ActionResult } from '@/lib/types';
import styles from './NewAssignmentInteractive.module.css';

// ── Props shape coming from the Server Component page ───────────

type SkillTaxonomy = {
  name: string;
  scoreBands: number[];
  count: number;
};

type DomainTaxonomy = {
  name: string;
  skills: SkillTaxonomy[];
};

type StudentOption = { id: string; name: string; email: string | null };
type PracticeTestOption = { id: string; label: string };
type LessonOption = { id: string; title: string };

type CreateAction = (
  prev: ActionResult | null,
  fd: FormData,
) => Promise<ActionResult | null>;

interface Props {
  students: StudentOption[];
  domains: DomainTaxonomy[];
  difficulties: number[];
  practiceTests: PracticeTestOption[];
  lessons: LessonOption[];
  createAction: CreateAction;
}

// ── Selected-skill state ────────────────────────────────────────

type SelectedSkill = {
  domain: string;
  skill: string;
  scoreBands: number[];  // empty = all available for this skill
  weight: number;        // 0.25 .. 3.0, default 1
  availableBands: number[];
  availableCount: number;
};

const DEFAULT_WEIGHT = 1;
const WEIGHT_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

function difficultyLabel(d: number): string {
  return { 1: 'Easy', 2: 'Medium', 3: 'Hard' }[d] ?? String(d);
}

// ── Component ───────────────────────────────────────────────────

export function NewAssignmentInteractive({
  students,
  domains,
  difficulties,
  practiceTests,
  lessons,
  createAction,
}: Props) {
  const [state, submitAction, isPending] = useActionState<ActionResult | null, FormData>(
    createAction,
    null,
  );

  const [assignmentType, setAssignmentType] = useState<'questions' | 'practice_test' | 'lesson'>(
    'questions',
  );
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectedSkills, setSelectedSkills] = useState<SelectedSkill[]>([]);
  const [globalDifficulties, setGlobalDifficulties] = useState<Set<number>>(new Set());
  const [skillSearch, setSkillSearch] = useState('');

  const totalWeight = useMemo(
    () => selectedSkills.reduce((sum, s) => sum + s.weight, 0),
    [selectedSkills],
  );

  // Skills already picked — keyed by domain|skill for O(1) lookup
  // in the browser list.
  const pickedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const s of selectedSkills) set.add(`${s.domain}|${s.skill}`);
    return set;
  }, [selectedSkills]);

  const filteredDomains = useMemo(() => {
    const q = skillSearch.trim().toLowerCase();
    if (!q) return domains;
    return domains
      .map((d) => ({
        ...d,
        skills: d.skills.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            d.name.toLowerCase().includes(q),
        ),
      }))
      .filter((d) => d.skills.length > 0);
  }, [domains, skillSearch]);

  const addSkill = (domain: string, skill: SkillTaxonomy) => {
    const key = `${domain}|${skill.name}`;
    if (pickedKeys.has(key)) return;
    setSelectedSkills((prev) => [
      ...prev,
      {
        domain,
        skill: skill.name,
        scoreBands: [],  // empty = all available
        weight: DEFAULT_WEIGHT,
        availableBands: skill.scoreBands,
        availableCount: skill.count,
      },
    ]);
  };

  const addAllInDomain = (domain: DomainTaxonomy) => {
    const toAdd = domain.skills.filter(
      (s) => !pickedKeys.has(`${domain.name}|${s.name}`),
    );
    if (toAdd.length === 0) return;
    setSelectedSkills((prev) => [
      ...prev,
      ...toAdd.map((s) => ({
        domain: domain.name,
        skill: s.name,
        scoreBands: [],
        weight: DEFAULT_WEIGHT,
        availableBands: s.scoreBands,
        availableCount: s.count,
      })),
    ]);
  };

  const removeSkill = (domain: string, skill: string) => {
    setSelectedSkills((prev) =>
      prev.filter((s) => !(s.domain === domain && s.skill === skill)),
    );
  };

  const updateSkill = (
    domain: string,
    skill: string,
    patch: Partial<SelectedSkill>,
  ) => {
    setSelectedSkills((prev) =>
      prev.map((s) =>
        s.domain === domain && s.skill === skill ? { ...s, ...patch } : s,
      ),
    );
  };

  const toggleBand = (domain: string, skill: string, band: number) => {
    setSelectedSkills((prev) =>
      prev.map((s) => {
        if (!(s.domain === domain && s.skill === skill)) return s;
        const has = s.scoreBands.includes(band);
        const next = has
          ? s.scoreBands.filter((b) => b !== band)
          : [...s.scoreBands, band].sort((a, b) => a - b);
        return { ...s, scoreBands: next };
      }),
    );
  };

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDifficulty = (d: number) => {
    setGlobalDifficulties((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  // Serialize the selected-skills payload into a hidden field.
  // The Server Action parses this JSON on submit. Kept as a single
  // blob because the shape is nested (per-skill arrays + weight).
  const skillSelectionsJson = useMemo(
    () =>
      JSON.stringify(
        selectedSkills.map((s) => ({
          domain: s.domain,
          skill: s.skill,
          scoreBands: s.scoreBands,
          weight: s.weight,
        })),
      ),
    [selectedSkills],
  );

  return (
    <form action={submitAction} className={styles.form}>
      {/* Type selector */}
      <section className={styles.card}>
        <div className={styles.sectionLabel}>Type</div>
        <div className={styles.typeRow}>
          {[
            { value: 'questions', label: 'Questions' },
            { value: 'practice_test', label: 'Practice test' },
            { value: 'lesson', label: 'Lesson' },
          ].map((t) => (
            <label
              key={t.value}
              className={`${styles.typeOption} ${
                assignmentType === t.value ? styles.typeOptionActive : ''
              }`}
            >
              <input
                type="radio"
                name="assignment_type"
                value={t.value}
                checked={assignmentType === t.value}
                onChange={() =>
                  setAssignmentType(t.value as typeof assignmentType)
                }
                className={styles.hidden}
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Common fields */}
      <section className={styles.card}>
        <div className={styles.sectionLabel}>Details</div>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel} htmlFor="title">Title</label>
          <input
            id="title"
            name="title"
            type="text"
            maxLength={200}
            className={styles.input}
          />
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel} htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            rows={2}
            className={styles.textarea}
          />
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel} htmlFor="due_date">Due date</label>
          <input
            id="due_date"
            name="due_date"
            type="date"
            className={`${styles.input} ${styles.inputSm}`}
          />
        </div>
      </section>

      {/* Students */}
      <section className={styles.card}>
        <div className={styles.sectionLabel}>
          Students
          <span className={styles.sectionCount}>
            ({selectedStudents.size} selected)
          </span>
        </div>
        {students.length === 0 ? (
          <p className={styles.empty}>You have no students yet.</p>
        ) : (
          <div className={styles.studentGrid}>
            {students.map((s) => (
              <label key={s.id} className={styles.studentItem}>
                <input
                  type="checkbox"
                  name="student_id"
                  value={s.id}
                  checked={selectedStudents.has(s.id)}
                  onChange={() => toggleStudent(s.id)}
                />
                <span className={styles.studentName}>
                  {s.name}
                  {s.email && (
                    <span className={styles.studentEmail}>{s.email}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      {/* Type-specific groups */}
      {assignmentType === 'questions' && (
        <section className={styles.card}>
          <div className={styles.sectionLabel}>Question pool</div>
          <p className={styles.sectionHint}>
            Pick which skills the assignment should cover. Each skill has
            its own score bands and a weight that controls how many of
            its questions appear relative to the others.
          </p>

          <div className={styles.twoCol}>
            {/* Left: skill browser */}
            <div className={styles.browserPanel}>
              <div className={styles.panelTitle}>
                <span>Available skills</span>
              </div>
              <input
                type="search"
                placeholder="Filter by skill or domain…"
                value={skillSearch}
                onChange={(e) => setSkillSearch(e.target.value)}
                className={styles.search}
              />
              {filteredDomains.length === 0 ? (
                <p className={styles.empty}>No skills match.</p>
              ) : (
                <ul className={styles.domainList}>
                  {filteredDomains.map((d) => {
                    const allAdded = d.skills.every((s) =>
                      pickedKeys.has(`${d.name}|${s.name}`),
                    );
                    return (
                      <li key={d.name} className={styles.domainBlock}>
                        <div className={styles.domainHeader}>
                          <span className={styles.domainName}>{d.name}</span>
                          <button
                            type="button"
                            className={styles.domainAddAll}
                            onClick={() => addAllInDomain(d)}
                            disabled={allAdded}
                          >
                            {allAdded ? 'All added' : 'Add all'}
                          </button>
                        </div>
                        <ul className={styles.skillList}>
                          {d.skills.map((s) => {
                            const picked = pickedKeys.has(`${d.name}|${s.name}`);
                            return (
                              <li
                                key={s.name}
                                className={`${styles.skillRow} ${
                                  picked ? styles.skillRowSelected : ''
                                }`}
                                onClick={() => !picked && addSkill(d.name, s)}
                              >
                                <span className={styles.skillRowName}>{s.name}</span>
                                <span className={styles.skillRowCount}>
                                  {picked ? 'added' : `${s.count} q`}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Right: selected skills */}
            <div className={styles.selectedPanel}>
              <div className={styles.panelTitle}>
                <span>Selected</span>
                <span>
                  {selectedSkills.length} skill
                  {selectedSkills.length === 1 ? '' : 's'}
                </span>
              </div>
              {selectedSkills.length === 0 ? (
                <p className={styles.emptySelected}>
                  Click a skill on the left to add it.
                </p>
              ) : (
                <ul className={styles.selectedList}>
                  {selectedSkills.map((s) => (
                    <li
                      key={`${s.domain}|${s.skill}`}
                      className={styles.selectedItem}
                    >
                      <div className={styles.selectedItemHeader}>
                        <div className={styles.selectedItemTitle}>
                          <div className={styles.selectedItemSkill}>
                            {s.skill}
                          </div>
                          <div className={styles.selectedItemDomain}>
                            {s.domain}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => removeSkill(s.domain, s.skill)}
                          aria-label="Remove skill"
                        >
                          ×
                        </button>
                      </div>

                      {s.availableBands.length > 0 && (
                        <div>
                          <div className={styles.controlLabel}>
                            Score bands
                            {s.scoreBands.length === 0 && ' (all)'}
                          </div>
                          <div className={styles.bandRow}>
                            {s.availableBands.map((b) => {
                              const active = s.scoreBands.includes(b);
                              return (
                                <button
                                  key={b}
                                  type="button"
                                  className={`${styles.bandChip} ${
                                    active ? styles.bandChipActive : ''
                                  }`}
                                  onClick={() => toggleBand(s.domain, s.skill, b)}
                                >
                                  {b}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div>
                        <div className={styles.controlLabel}>
                          Weight — relative share of the set
                        </div>
                        <div className={styles.weightRow}>
                          <input
                            type="range"
                            min={0}
                            max={WEIGHT_STEPS.length - 1}
                            step={1}
                            value={WEIGHT_STEPS.indexOf(s.weight) === -1
                              ? WEIGHT_STEPS.indexOf(DEFAULT_WEIGHT)
                              : WEIGHT_STEPS.indexOf(s.weight)}
                            onChange={(e) => {
                              const idx = Number(e.target.value);
                              updateSkill(s.domain, s.skill, {
                                weight: WEIGHT_STEPS[idx],
                              });
                            }}
                            className={styles.weightSlider}
                          />
                          <span className={styles.weightValue}>
                            {s.weight.toFixed(2).replace(/\.00$/, '')}×
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Global difficulty */}
          {difficulties.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div className={styles.controlLabel}>Difficulty (all skills)</div>
              <div className={styles.chipRow}>
                {difficulties.map((d) => {
                  const active = globalDifficulties.has(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                      onClick={() => toggleDifficulty(d)}
                    >
                      {difficultyLabel(d)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={styles.fieldRow} style={{ marginTop: '16px' }}>
            <label className={styles.fieldLabel} htmlFor="size">
              Size (1–50)
            </label>
            <input
              id="size"
              name="size"
              type="number"
              min={1}
              max={50}
              defaultValue={10}
              className={`${styles.input} ${styles.inputSm}`}
            />
          </div>

          {/* Hidden serialized payload fields. The Server Action reads
              skill_selections (JSON) and difficulty[] separately. */}
          <input
            type="hidden"
            name="skill_selections"
            value={skillSelectionsJson}
          />
          {Array.from(globalDifficulties).map((d) => (
            <input
              key={d}
              type="hidden"
              name="difficulty"
              value={String(d)}
            />
          ))}

          {selectedSkills.length > 0 && (
            <div className={styles.preview}>
              <span>
                <span className={styles.previewStrong}>{selectedSkills.length}</span>{' '}
                skill{selectedSkills.length === 1 ? '' : 's'} selected,{' '}
                total weight{' '}
                <span className={styles.previewStrong}>
                  {totalWeight.toFixed(2).replace(/\.00$/, '')}
                </span>
              </span>
              <span className={styles.muted}>
                Heaviest ×
                {Math.max(...selectedSkills.map((s) => s.weight))
                  .toFixed(2)
                  .replace(/\.00$/, '')}{' '}
                · Lightest ×
                {Math.min(...selectedSkills.map((s) => s.weight))
                  .toFixed(2)
                  .replace(/\.00$/, '')}
              </span>
            </div>
          )}
        </section>
      )}

      {assignmentType === 'practice_test' && (
        <section className={styles.card}>
          <div className={styles.sectionLabel}>Practice test</div>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="practice_test_id">Test</label>
            <select
              id="practice_test_id"
              name="practice_test_id"
              className={styles.select}
              defaultValue=""
            >
              <option value="" disabled>Select a practice test…</option>
              {practiceTests.map((pt) => (
                <option key={pt.id} value={pt.id}>{pt.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="sections">Sections</label>
            <select
              id="sections"
              name="sections"
              className={styles.select}
              defaultValue="both"
            >
              <option value="both">Both</option>
              <option value="rw">Reading &amp; Writing only</option>
              <option value="math">Math only</option>
            </select>
          </div>
        </section>
      )}

      {assignmentType === 'lesson' && (
        <section className={styles.card}>
          <div className={styles.sectionLabel}>Lesson</div>
          {lessons.length === 0 ? (
            <p className={styles.empty}>No published lessons yet.</p>
          ) : (
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel} htmlFor="lesson_id">Lesson</label>
              <select
                id="lesson_id"
                name="lesson_id"
                className={styles.select}
                defaultValue=""
              >
                <option value="" disabled>Select a lesson…</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>
          )}
        </section>
      )}

      {/* Submit */}
      <div className={styles.submitRow}>
        {state && !state.ok && (
          <span role="alert" className={styles.error}>{state.error}</span>
        )}
        <button
          type="submit"
          disabled={isPending}
          className={styles.submitButton}
        >
          {isPending ? 'Creating…' : 'Create assignment'}
        </button>
      </div>
    </form>
  );
}
