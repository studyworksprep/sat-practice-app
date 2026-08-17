// Teacher assignment-creation form. One form, four type-specific
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
import { useRouter, useSearchParams } from 'next/navigation';
import type { ActionResult } from '@/lib/types';
import type { LessonCatalogItem } from '@/lib/lesson/catalog';
import { LessonPicker } from './LessonPicker';
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

type PersonOption = { id: string; name: string; email: string | null };
type PracticeTestOption = { id: string; label: string };
type LessonPackOption = { id: string; name: string; questionCount: number };
type TemplateOption = { id: string; name: string };

/** Server-resolved one-click prefill (§4.3): a template or a
 *  student's weak skills. Skills are the persisted shape (no
 *  availableBands/Count) — rehydrated against `domains` below. */
type Prefill = {
  label: string;
  skills: { domain: string; skill: string; scoreBands: number[]; weight: number }[];
  difficulties: number[];
  size: number | null;
  unansweredOnly: boolean;
};

type CreateAction = (
  prev: ActionResult | null,
  fd: FormData,
) => Promise<ActionResult | null>;

type TemplateDeleteAction = (
  prev: ActionResult | null,
  fd: FormData,
) => Promise<ActionResult>;

interface Props {
  students: PersonOption[];
  /**
   * Teachers under this manager. Empty for non-managers — when
   * empty, the Target toggle is hidden and the form falls back
   * to the students-only behavior.
   */
  teachers?: PersonOption[];
  domains: DomainTaxonomy[];
  difficulties: number[];
  practiceTests: PracticeTestOption[];
  lessonPacks: LessonPackOption[];
  lessons?: LessonCatalogItem[];
  templates?: TemplateOption[];
  prefill?: Prefill | null;
  createAction: CreateAction;
  deleteTemplateAction?: TemplateDeleteAction;
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
  teachers = [],
  domains,
  difficulties,
  practiceTests,
  lessonPacks,
  lessons = [],
  templates = [],
  prefill = null,
  createAction,
  deleteTemplateAction,
}: Props) {
  const [state, submitAction, isPending] = useActionState<ActionResult | null, FormData>(
    createAction,
    null,
  );
  const router = useRouter();

  const hasTeachers = teachers.length > 0;
  const [assignmentType, setAssignmentType] = useState<
    'questions' | 'practice_test' | 'lesson' | 'lesson_pack'
  >('questions');

  // Deep-link support:
  //   ?target=trainees&teacher=<id> — manager flow from the teacher
  //     detail page; pre-selects the trainee tab + named teacher.
  //   ?student=<id> — tutor flow from the student profile's
  //     "+ New assignment" link; pre-checks the named student so
  //     the tutor doesn't have to re-find them in the picker.
  // ?target=trainees is only honored when the user actually has
  // teachers — a pure teacher landing on the form ignores it.
  const searchParams = useSearchParams();
  const initialTargetIsTrainees =
    hasTeachers && searchParams?.get('target') === 'trainees';
  const initialPreselectedTeacher = initialTargetIsTrainees
    ? searchParams?.get('teacher')
    : null;
  const initialPreselectedStudent = !initialTargetIsTrainees
    ? searchParams?.get('student')
    : null;

  // Target = students (default) or trainees (teachers). The
  // backend Server Action accepts the same student_id field for
  // both — assignment_students_v2.student_id is just a user_id
  // and doesn't care about role. The toggle is purely UX so a
  // manager can switch the picker between their two cohorts.
  const [target, setTarget] = useState<'students' | 'trainees'>(
    initialTargetIsTrainees ? 'trainees' : 'students',
  );
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(() => {
    // Pre-fill from ?teacher=<id> if it actually matches a row in
    // the teachers list. Silently dropped if it doesn't (e.g., a
    // stale link to a teacher who's since left the manager's team).
    if (
      initialPreselectedTeacher &&
      teachers.some((t) => t.id === initialPreselectedTeacher)
    ) {
      return new Set([initialPreselectedTeacher]);
    }
    // Same idea for ?student=<id> from the student profile.
    if (
      initialPreselectedStudent &&
      students.some((s) => s.id === initialPreselectedStudent)
    ) {
      return new Set([initialPreselectedStudent]);
    }
    return new Set();
  });
  // Prefill (§4.3): rehydrate the persisted skill shape against the
  // live taxonomy — availableBands/availableCount come from the
  // `domains` prop, and skills that have vanished from the published
  // bank are silently dropped rather than submitted into a
  // guaranteed sampling failure.
  const [selectedSkills, setSelectedSkills] = useState<SelectedSkill[]>(() => {
    if (!prefill?.skills?.length) return [];
    const out: SelectedSkill[] = [];
    for (const p of prefill.skills) {
      const domain = domains.find((d) => d.name === p.domain);
      const skill = domain?.skills.find((sk) => sk.name === p.skill);
      if (!domain || !skill) continue;
      const bands = Array.isArray(p.scoreBands)
        ? p.scoreBands.filter((b) => skill.scoreBands.includes(b))
        : [];
      out.push({
        domain: domain.name,
        skill: skill.name,
        scoreBands: bands,
        weight: WEIGHT_STEPS.includes(p.weight) ? p.weight : DEFAULT_WEIGHT,
        availableBands: skill.scoreBands,
        availableCount: skill.count,
      });
    }
    return out;
  });
  const [globalDifficulties, setGlobalDifficulties] = useState<Set<number>>(
    () => new Set((prefill?.difficulties ?? []).filter((d) => difficulties.includes(d))),
  );
  const [skillSearch, setSkillSearch] = useState('');
  // When on, the Server Action drops any question a selected student
  // has already attempted (see actions.ts buildQuestionsPayload).
  const [unattemptedOnly, setUnattemptedOnly] = useState(prefill?.unansweredOnly ?? false);
  // Save-as-template (§4.3) — questions type only.
  const [saveTemplate, setSaveTemplate] = useState(false);

  const visiblePeople = target === 'trainees' ? teachers : students;
  const peopleLabel = target === 'trainees' ? 'Trainees' : 'Students';
  const peopleEmpty =
    target === 'trainees' ? 'You have no teachers on your team yet.' : 'You have no students yet.';

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

  // Applying a template navigates with ?template= (server-side
  // prefill) so the recipe resolves through the same path as a
  // shared deep link; the current ?student selection is preserved.
  const applyTemplate = (templateId: string) => {
    if (!templateId) return;
    const qs = new URLSearchParams({ template: templateId });
    const student = searchParams?.get('student') ?? searchParams?.get('from_student');
    if (student) qs.set('student', student);
    router.push(`/tutor/assignments/new?${qs.toString()}`);
  };

  return (
    <form action={submitAction} className={styles.form}>
      {/* Template shelf (§4.3) */}
      {templates.length > 0 && (
        <section className={styles.card}>
          <div className={styles.sectionLabel}>Start from a template</div>
          <p className={styles.sectionHint}>
            Your saved question recipes. Applying one fills the skill picker below —
            fresh questions are sampled each time.
          </p>
          <ul className={styles.templateList}>
            {templates.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                onApply={applyTemplate}
                deleteAction={deleteTemplateAction}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Type selector */}
      <section className={styles.card}>
        <div className={styles.sectionLabel}>Type</div>
        <div className={styles.typeRow}>
          {[
            { value: 'questions', label: 'Questions' },
            { value: 'practice_test', label: 'Practice test' },
            { value: 'lesson', label: 'Lesson' },
            { value: 'lesson_pack', label: 'Lesson pack' },
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

      {/* Students / Trainees */}
      <section className={styles.card}>
        <div className={styles.sectionLabel}>
          {peopleLabel}
          <span className={styles.sectionCount}>
            ({selectedStudents.size} selected)
          </span>
        </div>
        {hasTeachers && (
          <div className={styles.targetRow}>
            <label
              className={`${styles.typeOption} ${target === 'students' ? styles.typeOptionActive : ''}`}
            >
              <input
                type="radio"
                name="target_kind"
                value="students"
                checked={target === 'students'}
                onChange={() => {
                  setTarget('students');
                  setSelectedStudents(new Set());
                }}
                className={styles.hidden}
              />
              <span>Students</span>
            </label>
            <label
              className={`${styles.typeOption} ${target === 'trainees' ? styles.typeOptionActive : ''}`}
            >
              <input
                type="radio"
                name="target_kind"
                value="trainees"
                checked={target === 'trainees'}
                onChange={() => {
                  setTarget('trainees');
                  setSelectedStudents(new Set());
                }}
                className={styles.hidden}
              />
              <span>Trainees (teachers)</span>
            </label>
          </div>
        )}
        {visiblePeople.length === 0 ? (
          <p className={styles.empty}>{peopleEmpty}</p>
        ) : (
          <div className={styles.studentGrid}>
            {visiblePeople.map((s) => (
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
          {prefill && selectedSkills.length > 0 && (
            <p className={styles.prefillBanner}>
              Prefilled from <strong>{prefill.label}</strong> — adjust freely before creating.
            </p>
          )}

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

          {/* Not-attempted filter */}
          <div style={{ marginTop: '16px' }}>
            <div className={styles.controlLabel}>Attempt status</div>
            <label className={styles.notAttempted}>
              <input
                type="checkbox"
                name="unanswered_only"
                value="1"
                checked={unattemptedOnly}
                onChange={(e) => setUnattemptedOnly(e.target.checked)}
              />
              <span className={styles.notAttemptedText}>
                <span>Only questions not yet attempted</span>
                <span className={styles.muted}>
                  {selectedStudents.size > 1
                    ? `Excludes any question already attempted by any of the ${selectedStudents.size} selected students.`
                    : 'Excludes any question already attempted by a selected student.'}
                </span>
              </span>
            </label>
          </div>

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
              defaultValue={prefill?.size ?? 10}
              className={`${styles.input} ${styles.inputSm}`}
            />
          </div>

          {/* Save-as-template (§4.3): stores the recipe above under a
              name so the next assignment starts from this shelf. */}
          <div style={{ marginTop: '16px' }}>
            <label className={styles.notAttempted}>
              <input
                type="checkbox"
                name="save_template"
                value="1"
                checked={saveTemplate}
                onChange={(e) => setSaveTemplate(e.target.checked)}
              />
              <span className={styles.notAttemptedText}>
                <span>Save these filters as a template</span>
                <span className={styles.muted}>
                  Skills, weights, bands, difficulty, and size — reusable from
                  &ldquo;Start from a template&rdquo; on this page.
                </span>
              </span>
            </label>
            {saveTemplate && (
              <div className={styles.fieldRow} style={{ marginTop: '8px' }}>
                <label className={styles.fieldLabel} htmlFor="template_name">
                  Template name
                </label>
                <input
                  id="template_name"
                  name="template_name"
                  type="text"
                  maxLength={120}
                  required
                  placeholder="e.g. Algebra tune-up, 10 medium"
                  className={styles.input}
                />
              </div>
            )}
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
            <LessonPicker lessons={lessons} />
          )}
        </section>
      )}

      {assignmentType === 'lesson_pack' && (
        <section className={styles.card}>
          <div className={styles.sectionLabel}>Lesson pack</div>
          {lessonPacks.length === 0 ? (
            <p className={styles.empty}>
              You don&apos;t have any lesson packs with questions yet.{' '}
              <a href="/tutor/lesson-packs">Create one →</a>
            </p>
          ) : (
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel} htmlFor="lesson_pack_id">Pack</label>
              <select
                id="lesson_pack_id"
                name="lesson_pack_id"
                className={styles.select}
                defaultValue=""
              >
                <option value="" disabled>Select a pack…</option>
                {lessonPacks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.questionCount} question{p.questionCount === 1 ? '' : 's'}
                  </option>
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

// ── Template shelf row (§4.3) ───────────────────────────────────
// Lives outside the main <form> flow visually but INSIDE it in the
// DOM would nest forms — so delete goes through a button click that
// builds its own FormData, ArchiveButton-style, instead of a nested
// <form action>.

function TemplateRow({
  template,
  onApply,
  deleteAction,
}: {
  template: TemplateOption;
  onApply: (id: string) => void;
  deleteAction?: TemplateDeleteAction;
}) {
  const [deleteState, setDeleteState] = useState<ActionResult | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteAction || deleting) return;
    setDeleting(true);
    const fd = new FormData();
    fd.set('template_id', template.id);
    const result = await deleteAction(null, fd);
    setDeleteState(result);
    setDeleting(false);
  };

  if (deleteState?.ok) return null;

  return (
    <li className={styles.templateRow}>
      <span className={styles.templateName}>{template.name}</span>
      <span className={styles.templateActions}>
        <button
          type="button"
          className={styles.templateApplyBtn}
          onClick={() => onApply(template.id)}
        >
          Apply
        </button>
        <button
          type="button"
          className={styles.templateDeleteBtn}
          onClick={handleDelete}
          disabled={deleting || !deleteAction}
          aria-label={`Delete template ${template.name}`}
          title={deleteState && !deleteState.ok ? deleteState.error : 'Delete template'}
        >
          {deleting ? '…' : '✕'}
        </button>
      </span>
    </li>
  );
}
