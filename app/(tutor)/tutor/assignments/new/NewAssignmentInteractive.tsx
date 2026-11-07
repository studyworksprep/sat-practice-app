// Teacher assignment-creation form, in four numbered steps beside a
// sticky "This assignment" summary that holds Create:
//
//   1. What are you assigning? — SAT/ACT, the type, saved templates.
//   2. Who is it for? — the students added so far, plus "Add student"
//      (a roster search; StudentPicker). Managers can switch to
//      trainees. At least one person is required to create.
//   3. The content — skills (SAT, grouped Math | Reading & Writing) or
//      ACT categories, with score band (SAT) or difficulty (ACT), size
//      and "only unseen"; or the practice test, lesson or lesson pack.
//   4. Name and due date.
//
// Key design points kept from the original form:
// - The SAT score-band chips (1–7) apply to every selected skill; a
//   skill fine-tuned with its own bands under "Fine-tune selected
//   skills" uses those instead. Weight (relative sampling share) is
//   per skill. ACT keeps its assignment-wide difficulty levels.
// - Selected skills / ACT picks serialize to one hidden JSON field each
//   (nested shapes); every field name the Server Action reads
//   (actions.ts) is unchanged.
// - Only one of the SAT / ACT question pools is mounted, so their
//   same-named fields (size) never both submit.

'use client';

import { useActionState, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ActionResult } from '@/lib/types';
import type { LessonCatalogItem } from '@/lib/lesson/catalog';
import { ACT_SECTIONS, type ActSection } from '@/lib/practice/act-taxonomy';
import { actSelectionKey as actKey, parseActSelections, type ActSectionTaxonomy } from '@/lib/practice/act-assignment-taxonomy';
import type { ActAssignmentCatalog } from '@/lib/tutor/act-assignment-catalog';
import { formatCalendarDate } from '@/lib/formatters';
import { LessonPicker } from './LessonPicker';
import { ActPoolPicker } from './ActPoolPicker';
import {
  DEFAULT_WEIGHT,
  SatSkillPicker,
  WEIGHT_STEPS,
  type DomainTaxonomy,
  type SelectedSkill,
  type SkillTaxonomy,
} from './SatSkillPicker';
import { TemplateShelf, type TemplateDeleteAction, type TemplateOption } from './TemplateShelf';
import { StudentPicker, type PersonOption } from './StudentPicker';
import styles from './NewAssignmentInteractive.module.css';

type PracticeTestOption = { id: string; label: string };
type LessonPackOption = { id: string; name: string; questionCount: number };
type AssignmentType = 'questions' | 'practice_test' | 'lesson' | 'lesson_pack';

/** Server-resolved one-click prefill (§4.3): a template or a
 *  student's weak skills, rehydrated against `domains` below. */
type Prefill = {
  label: string;
  testType?: 'sat' | 'act';
  skills: { domain: string; skill: string; scoreBands: number[]; weight: number }[];
  actSelections?: { section: string; category: string; subcategory?: string }[];
  /** ACT difficulty levels. */
  difficulties: number[];
  /** SAT assignment-wide score bands. */
  scoreBands?: number[];
  size: number | null;
  unansweredOnly: boolean;
};

type CreateAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult | null>;

interface Props {
  students: PersonOption[];
  /** Teachers under this manager; empty for non-managers (no Target toggle). */
  teachers?: PersonOption[];
  domains: DomainTaxonomy[];
  practiceTests: PracticeTestOption[];
  lessonPacks: LessonPackOption[];
  lessons?: LessonCatalogItem[];
  templates?: TemplateOption[];
  initialActCatalog?: ActAssignmentCatalog | null;
  loadActCatalogAction: () => Promise<ActionResult<{ data: ActAssignmentCatalog }>>;
  prefill?: Prefill | null;
  createAction: CreateAction;
  deleteTemplateAction?: TemplateDeleteAction;
}

const EMPTY_ACT_CATALOG: ActAssignmentCatalog = { taxonomy: [], difficulties: [], forms: [] };

const TYPE_OPTIONS: Array<{ value: AssignmentType; label: string; act: boolean }> = [
  { value: 'questions', label: 'Questions', act: true },
  { value: 'practice_test', label: 'Practice test', act: true },
  { value: 'lesson', label: 'Lesson', act: false },
  { value: 'lesson_pack', label: 'Lesson pack', act: false },
];

const STEP3_TITLE: Record<AssignmentType, string> = {
  questions: 'Which skills?',
  practice_test: 'Which test?',
  lesson: 'Which lesson?',
  lesson_pack: 'Which pack?',
};

/** [1,2,3,5,7] → "1–3, 5, 7". */
export function formatBands(bands: number[]): string {
  const sorted = [...bands].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    runs.push(j - i >= 2 ? `${sorted[i]}–${sorted[j]}` : sorted.slice(i, j + 1).join(', '));
    i = j;
  }
  return runs.join(', ');
}

function clampSize(text: string): number {
  const n = Math.floor(Number(text));
  return Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : 10;
}

// ── Component ───────────────────────────────────────────────────

export function NewAssignmentInteractive({
  students,
  teachers = [],
  domains,
  practiceTests,
  lessonPacks,
  lessons = [],
  templates = [],
  initialActCatalog = null,
  loadActCatalogAction,
  prefill = null,
  createAction,
  deleteTemplateAction,
}: Props) {
  const [state, submitAction, isPending] = useActionState<ActionResult | null, FormData>(
    createAction,
    null,
  );
  const router = useRouter();
  const [actCatalog, setActCatalog] = useState(initialActCatalog);
  const [actCatalogError, setActCatalogError] = useState<string | null>(null);
  const [isActCatalogPending, startCatalogTransition] = useTransition();
  const catalogRequested = useRef(false);
  const { taxonomy: actTaxonomy, difficulties: actDifficulties, forms: actForms } = actCatalog ?? EMPTY_ACT_CATALOG;
  const [actSourceTest, setActSourceTest] = useState('');
  const [actTestSections, setActTestSections] = useState<ActSection[]>([...ACT_SECTIONS]);
  const availableActSections = actForms.find(form => form.sourceTest === actSourceTest)?.sections ?? ACT_SECTIONS;

  const hasTeachers = teachers.length > 0;
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('questions');

  // Which bank (Phase 4B). ACT offers question sets and practice
  // tests; lessons and lesson packs are SAT content, so switching to
  // ACT with one of those selected falls back to a question set.
  const [testType, setTestType] = useState<'sat' | 'act'>(
    prefill?.testType === 'act' ? 'act' : 'sat',
  );
  const [actSelected, setActSelected] = useState<Set<string>>(() => {
    if (prefill?.testType !== 'act') return new Set();
    const valid = new Set(
      actTaxonomy.flatMap((sec) => sec.categories.flatMap((c) => [
        actKey(sec.section, c.name),
        ...c.subcategories.map((sub) => actKey(sec.section, c.name, sub.name)),
      ])),
    );
    return new Set(
      parseActSelections(prefill.actSelections)
        .map((s) => actKey(s.section, s.category, s.subcategory))
        .filter((k) => valid.has(k)),
    );
  });
  const [actDiffs, setActDiffs] = useState<Set<number>>(() =>
    new Set(
      prefill?.testType === 'act'
        ? (prefill.difficulties ?? []).filter((d) => actDifficulties.includes(d))
        : [],
    ),
  );

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
  // Score bands present anywhere in the published SAT bank (1–7).
  const bandOptions = useMemo(
    () => [...new Set(domains.flatMap((d) => d.skills.flatMap((sk) => sk.scoreBands)))].sort((a, b) => a - b),
    [domains],
  );
  const [globalBands, setGlobalBands] = useState<Set<number>>(
    () => new Set(
      prefill?.testType === 'act'
        ? []
        : (prefill?.scoreBands ?? []).filter((b) => bandOptions.includes(b)),
    ),
  );
  const [skillSearch, setSkillSearch] = useState('');
  // When on, the Server Action drops any question a selected student
  // has already attempted (see actions.ts buildQuestionsPayload).
  const [unattemptedOnly, setUnattemptedOnly] = useState(prefill?.unansweredOnly ?? false);
  // Save-as-template (§4.3) — questions type only.
  const [saveTemplate, setSaveTemplate] = useState(false);
  // Controlled so the summary can read them.
  const [sizeText, setSizeText] = useState(String(prefill?.size ?? 10));
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [practiceTestId, setPracticeTestId] = useState('');
  const [lessonPackId, setLessonPackId] = useState('');

  const visiblePeople = target === 'trainees' ? teachers : students;
  const peopleNoun = target === 'trainees' ? 'trainee' : 'student';
  const peopleEmpty =
    target === 'trainees' ? 'You have no teachers on your team yet.' : 'You have no students yet.';

  // Skills already picked — keyed by domain|skill for O(1) lookup
  // in the browser list.
  const pickedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const s of selectedSkills) set.add(`${s.domain}|${s.skill}`);
    return set;
  }, [selectedSkills]);

  const toggleSkill = (domain: string, skill: SkillTaxonomy) => {
    const key = `${domain}|${skill.name}`;
    if (pickedKeys.has(key)) {
      removeSkill(domain, skill.name);
      return;
    }
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

  const toggleDomain = (domain: DomainTaxonomy, on: boolean) => {
    if (!on) {
      setSelectedSkills((prev) => prev.filter((s) => s.domain !== domain.name));
      return;
    }
    const toAdd = domain.skills.filter((s) => !pickedKeys.has(`${domain.name}|${s.name}`));
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

  const addStudent = (id: string) => setSelectedStudents((prev) => new Set(prev).add(id));
  const removeStudent = (id: string) => setSelectedStudents((prev) => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });
  const addAllStudents = () => setSelectedStudents((prev) => new Set([...prev, ...visiblePeople.map((p) => p.id)]));

  const toggleBandFilter = (b: number) => {
    setGlobalBands((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  };

  // ── ACT picker state (Phase 4B) ─────────────────────────────────
  const ensureActCatalog = () => {
    if (actCatalog || catalogRequested.current) return;
    catalogRequested.current = true;
    setActCatalogError(null);
    startCatalogTransition(async () => {
      try {
        const result = await loadActCatalogAction();
        // Keep successful requests marked while React commits the result;
        // failures release the guard so the user can retry.
        if (!result.ok) catalogRequested.current = false;
        startCatalogTransition(() => {
          if (result.ok) setActCatalog(result.data);
          else setActCatalogError(result.error);
        });
      } catch {
        catalogRequested.current = false;
        setActCatalogError('Could not load ACT options. Please try again.');
      }
    });
  };
  const switchTestType = (next: 'sat' | 'act') => {
    setTestType(next);
    if (next === 'act') ensureActCatalog();
    if (next === 'act' && (assignmentType === 'lesson' || assignmentType === 'lesson_pack')) {
      setAssignmentType('questions');
    }
  };
  const toggleActCategory = (section: string, category: string, subcategory?: string) => {
    const key = actKey(section, category, subcategory);
    setActSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else {
        if (!subcategory) {
          for (const selected of next) {
            const [s, c] = JSON.parse(selected);
            if (s === section && c === category) next.delete(selected);
          }
        }
        next.add(key);
      }
      return next;
    });
  };
  const setActSectionAll = (sec: ActSectionTaxonomy, on: boolean) => {
    setActSelected((prev) => {
      const next = new Set(prev);
      for (const c of sec.categories) {
        const key = actKey(sec.section, c.name);
        if (on) next.add(key);
        else next.delete(key);
        for (const sub of c.subcategories) next.delete(actKey(sec.section, c.name, sub.name));
      }
      return next;
    });
  };
  const toggleActDiff = (d: number) => {
    setActDiffs((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };
  const actSelectionsJson = useMemo(
    () =>
      JSON.stringify(
        Array.from(actSelected).map((key) => {
          const [section, category, subcategory] = JSON.parse(key);
          return { section, category, ...(subcategory ? { subcategory } : {}) };
        }),
      ),
    [actSelected],
  );
  const actSelectedCount = useMemo(() => {
    let n = 0;
    for (const sec of actTaxonomy) {
      for (const c of sec.categories) {
        if (actSelected.has(actKey(sec.section, c.name))) n += c.count;
        else for (const sub of c.subcategories) {
          if (actSelected.has(actKey(sec.section, c.name, sub.name))) n += sub.count;
        }
      }
    }
    return n;
  }, [actTaxonomy, actSelected]);

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

  // ── Summary ─────────────────────────────────────────────────────
  const size = clampSize(sizeText);
  // In the order they were added, matching the chips.
  const chosenPeople = [...selectedStudents]
    .map((id) => visiblePeople.find((p) => p.id === id))
    .filter((p): p is PersonOption => !!p);
  const forLabel = chosenPeople.length === 0
    ? 'No one yet'
    : chosenPeople.length <= 2
      ? chosenPeople.map((p) => p.name).join(', ')
      : `${chosenPeople.length} ${target === 'trainees' ? 'trainees' : 'students'}`;
  const testLabel = testType === 'act' ? 'ACT' : 'SAT';
  const headline = assignmentType === 'questions'
    ? `${size} ${testLabel} question${size === 1 ? '' : 's'}`
    : assignmentType === 'practice_test'
      ? (testType === 'act'
          ? actForms.find((f) => f.sourceTest === actSourceTest)?.label
          : practiceTests.find((p) => p.id === practiceTestId)?.label) ?? `${testLabel} practice test`
      : assignmentType === 'lesson_pack'
        ? lessonPacks.find((p) => p.id === lessonPackId)?.name ?? 'Lesson pack'
        : 'Lesson';
  const skillDomains = [...new Set(selectedSkills.map((s) => s.domain))];
  const skillsLabel = testType === 'act'
    ? (actSelected.size === 0 ? 'None yet' : `${actSelected.size} selection${actSelected.size === 1 ? '' : 's'} · ${actSelectedCount.toLocaleString()} questions`)
    : selectedSkills.length === 0
      ? 'None yet'
      : `${selectedSkills.length} · ${skillDomains.length <= 2 ? skillDomains.join(', ') : `${skillDomains.length} domains`}`;
  const levelText = testType === 'act'
    ? (actDiffs.size === 0 ? 'Any' : [...actDiffs].sort().map((d) => `Level ${d}`).join(', '))
    : (globalBands.size === 0 ? 'Any' : `Band${globalBands.size === 1 ? '' : 's'} ${formatBands([...globalBands])}`);
  const missing: string[] = [];
  if (chosenPeople.length === 0) missing.push(target === 'trainees' ? 'a trainee' : 'a student');
  if (assignmentType === 'questions' && testType === 'sat' && selectedSkills.length === 0) missing.push('at least one skill');
  if (assignmentType === 'questions' && testType === 'act' && actSelected.size === 0) missing.push('at least one category');
  if (assignmentType === 'practice_test' && testType === 'sat' && !practiceTestId) missing.push('a practice test');
  if (assignmentType === 'practice_test' && testType === 'act' && !actSourceTest) missing.push('an ACT form');
  if (assignmentType === 'lesson_pack' && !lessonPackId) missing.push('a lesson pack');

  const onlyStudent = target === 'students' && chosenPeople.length === 1 ? chosenPeople[0] : null;
  const weaknessLink = onlyStudent ? (
    <a
      href={`/tutor/assignments/new?student=${onlyStudent.id}&from_student=${onlyStudent.id}`}
      className={styles.linkBtn}
      title="Fill the picker with this student's weakest recent skills, weighted by how often they were missed"
    >
      Use {onlyStudent.name.split(' ')[0]}&apos;s weakest skills
    </a>
  ) : null;

  const levelOptions = testType === 'act' ? actDifficulties : bandOptions;
  const questionOptions = (
    <div className={styles.optionRow}>
      {levelOptions.length > 0 && (
        <fieldset className={styles.inlineGroup}>
          <legend className={styles.controlLabel}>
            {testType === 'act' ? 'Difficulty (1 easiest – 5 hardest)' : 'Score band (1 easiest – 7 hardest)'}
          </legend>
          <div className={styles.chipRow}>
            {levelOptions.map((d) => {
              const active = testType === 'act' ? actDiffs.has(d) : globalBands.has(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={active}
                  aria-label={testType === 'act' ? undefined : `Score band ${d}`}
                  className={`${styles.chip} ${testType === 'sat' ? styles.chipBand : ''} ${active ? styles.chipActive : ''}`}
                  onClick={() => (testType === 'act' ? toggleActDiff(d) : toggleBandFilter(d))}
                >
                  {testType === 'act' ? `Level ${d}` : d}
                </button>
              );
            })}
          </div>
          {testType === 'sat' && (
            <span className={styles.optionHint}>
              {globalBands.size === 0
                ? 'Any band unless you pick some.'
                : selectedSkills.some((sk) => sk.scoreBands.length > 0)
                  ? 'Applies to every skill except ones fine-tuned below.'
                  : 'Applies to every selected skill.'}
            </span>
          )}
        </fieldset>
      )}
      <label className={styles.checkInline}>
        <input
          type="checkbox"
          name="unanswered_only"
          value="1"
          checked={unattemptedOnly}
          onChange={(e) => setUnattemptedOnly(e.target.checked)}
        />
        <span>
          Only questions they haven&apos;t seen
          <span className={styles.muted}>
            {selectedStudents.size > 1 ? ` · skips anything any of the ${selectedStudents.size} has tried` : ''}
          </span>
        </span>
      </label>
      <label className={styles.sizeField}>
        Questions
        <input
          name="size"
          type="number"
          min={1}
          max={50}
          value={sizeText}
          onChange={(e) => setSizeText(e.target.value)}
          onBlur={() => setSizeText(String(clampSize(sizeText)))}
          className={`${styles.input} ${styles.inputSm}`}
        />
      </label>
    </div>
  );

  return (
    <form action={submitAction} className={styles.layout}>
      <div className={styles.steps}>
        {/* ── 1. What ─────────────────────────────────────────── */}
        <section className={styles.step} aria-labelledby="step-1">
          <h2 id="step-1" className={styles.stepTitle}><span className={styles.stepNum}>1</span>What are you assigning?</h2>
          <div className={styles.typeBar}>
            <div className={styles.segmented} role="radiogroup" aria-label="Test">
              {(['sat', 'act'] as const).map((t) => (
                <label key={t} className={testType === t ? styles.segOn : undefined}>
                  <input type="radio" name="test_type" value={t} checked={testType === t} onChange={() => switchTestType(t)} className={styles.pillInput} />
                  {t.toUpperCase()}
                </label>
              ))}
            </div>
            <div className={styles.segmented} role="radiogroup" aria-label="Assignment type">
              {TYPE_OPTIONS.filter((t) => testType === 'sat' || t.act).map((t) => (
                <label key={t.value} className={assignmentType === t.value ? styles.segOn : undefined}>
                  <input
                    type="radio"
                    name="assignment_type"
                    value={t.value}
                    checked={assignmentType === t.value}
                    onChange={() => setAssignmentType(t.value)}
                    className={styles.pillInput}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          {assignmentType === 'questions' && templates.length > 0 && (
            <TemplateShelf templates={templates} onApply={applyTemplate} deleteAction={deleteTemplateAction} />
          )}
        </section>

        {/* ── 2. Who ──────────────────────────────────────────── */}
        <section className={styles.step} aria-labelledby="step-2">
          <div className={styles.stepHead}>
            <h2 id="step-2" className={styles.stepTitle}><span className={styles.stepNum}>2</span>Who is it for?</h2>
            <span className={styles.stepHint}>{selectedStudents.size} selected</span>
          </div>
          {hasTeachers && (
            <div className={styles.segmented} role="radiogroup" aria-label="Assign to">
              {(['students', 'trainees'] as const).map((t) => (
                <label key={t} className={target === t ? styles.segOn : undefined}>
                  <input
                    type="radio"
                    name="target_kind"
                    value={t}
                    checked={target === t}
                    onChange={() => { setTarget(t); setSelectedStudents(new Set()); }}
                    className={styles.pillInput}
                  />
                  {t === 'students' ? 'Students' : 'Trainees (teachers)'}
                </label>
              ))}
            </div>
          )}
          <StudentPicker
            people={visiblePeople}
            selected={[...selectedStudents]}
            onAdd={addStudent}
            onAddAll={addAllStudents}
            onRemove={removeStudent}
            noun={peopleNoun}
            emptyText={peopleEmpty}
          />
        </section>

        {/* ── 3. Content ──────────────────────────────────────── */}
        <section className={styles.step} aria-labelledby="step-3">
          <h2 id="step-3" className={styles.stepTitle}><span className={styles.stepNum}>3</span>{STEP3_TITLE[assignmentType]}</h2>

          {testType === 'act' && !actCatalog && (
            <div aria-busy={isActCatalogPending}>
              {actCatalogError ? (
                <>
                  <p role="alert" className={styles.error}>{actCatalogError}</p>
                  <button type="button" className={styles.linkBtn} onClick={ensureActCatalog}>Try again</button>
                </>
              ) : <p role="status" className={styles.muted}>Loading ACT questions and tests…</p>}
            </div>
          )}

          {assignmentType === 'questions' && testType === 'sat' && (
            <>
              <SatSkillPicker
                domains={domains}
                selected={selectedSkills}
                search={skillSearch}
                onSearch={setSkillSearch}
                onToggleSkill={toggleSkill}
                onToggleDomain={toggleDomain}
                onToggleBand={toggleBand}
                onWeight={(domain, skill, weight) => updateSkill(domain, skill, { weight })}
                globalBands={[...globalBands]}
                prefillLabel={prefill?.testType !== 'act' ? prefill?.label ?? null : null}
                weaknessLink={weaknessLink}
              />
              {questionOptions}
              <input type="hidden" name="skill_selections" value={skillSelectionsJson} />
              {Array.from(globalBands).map((b) => <input key={b} type="hidden" name="score_band" value={String(b)} />)}
            </>
          )}

          {assignmentType === 'questions' && testType === 'act' && actCatalog && (
            <>
              <ActPoolPicker
                taxonomy={actTaxonomy}
                selected={actSelected}
                onToggle={toggleActCategory}
                onSectionAll={setActSectionAll}
                prefillLabel={prefill?.testType === 'act' ? prefill.label : null}
              />
              {questionOptions}
              <input type="hidden" name="act_selections" value={actSelectionsJson} />
              {Array.from(actDiffs).map((d) => <input key={d} type="hidden" name="difficulty" value={String(d)} />)}
            </>
          )}

          {assignmentType === 'practice_test' && testType === 'sat' && (
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Test</span>
                <select name="practice_test_id" className={styles.select} value={practiceTestId} onChange={(e) => setPracticeTestId(e.target.value)}>
                  <option value="" disabled>Select a practice test…</option>
                  {practiceTests.map((pt) => <option key={pt.id} value={pt.id}>{pt.label}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Sections</span>
                <select name="sections" className={styles.select} defaultValue="both">
                  <option value="both">Both</option>
                  <option value="rw">Reading &amp; Writing only</option>
                  <option value="math">Math only</option>
                </select>
              </label>
            </div>
          )}

          {assignmentType === 'practice_test' && testType === 'act' && actCatalog && (
            <>
              {actForms.length === 0 ? (
                <p className={styles.empty}>No ACT forms in the bank yet.</p>
              ) : (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Form</span>
                  <select
                    name="act_source_test"
                    className={styles.select}
                    value={actSourceTest}
                    onChange={(event) => {
                      setActSourceTest(event.target.value);
                      setActTestSections(actForms.find((form) => form.sourceTest === event.target.value)?.sections ?? []);
                    }}
                  >
                    <option value="" disabled>Select an ACT form…</option>
                    {actForms.map((f) => <option key={f.sourceTest} value={f.sourceTest}>{f.label}</option>)}
                  </select>
                </label>
              )}
              <fieldset className={styles.actSectionList}>
                <legend className={styles.fieldLabel}>Sections</legend>
                {ACT_SECTIONS.map((section) => {
                  const available = availableActSections.includes(section);
                  return (
                    <label key={section} className={styles.actSectionToggle}>
                      <span>{section[0].toUpperCase() + section.slice(1)}{!available && ' (unavailable)'}</span>
                      <input
                        type="checkbox"
                        role="switch"
                        name="act_sections"
                        value={section}
                        checked={available && actTestSections.includes(section)}
                        disabled={!available}
                        onChange={(event) => setActTestSections((current) => event.target.checked
                          ? [...current, section] : current.filter((value) => value !== section))}
                      />
                    </label>
                  );
                })}
              </fieldset>
              <p className={styles.sectionHint}>
                The assignment is complete once every selected section is finished. Students choose
                standard or extended time when they start.
              </p>
            </>
          )}

          {assignmentType === 'lesson' && (
            lessons.length === 0 ? <p className={styles.empty}>No published lessons yet.</p> : <LessonPicker lessons={lessons} />
          )}

          {assignmentType === 'lesson_pack' && (
            lessonPacks.length === 0 ? (
              <p className={styles.empty}>
                You don&apos;t have any lesson packs with questions yet. <Link href="/tutor/lesson-packs">Create one →</Link>
              </p>
            ) : (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Pack</span>
                <select name="lesson_pack_id" className={styles.select} value={lessonPackId} onChange={(e) => setLessonPackId(e.target.value)}>
                  <option value="" disabled>Select a pack…</option>
                  {lessonPacks.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {p.questionCount} question{p.questionCount === 1 ? '' : 's'}</option>
                  ))}
                </select>
              </label>
            )
          )}
        </section>

        {/* ── 4. Name and due date ────────────────────────────── */}
        <section className={styles.step} aria-labelledby="step-4">
          <h2 id="step-4" className={styles.stepTitle}><span className={styles.stepNum}>4</span>Name and due date</h2>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Title <span className={styles.muted}>(optional)</span></span>
              <input name="title" type="text" maxLength={200} className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Named after the content if left blank" />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Due <span className={styles.muted}>(optional)</span></span>
              <input name="due_date" type="date" className={styles.input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Note to the student <span className={styles.muted}>(optional)</span></span>
            <textarea name="description" rows={2} className={styles.textarea} />
          </label>
        </section>
      </div>

      {/* ── Summary ─────────────────────────────────────────── */}
      <aside className={styles.summary} aria-labelledby="summary-title">
        <h2 id="summary-title" className={styles.summaryTitle}>This assignment</h2>
        <p className={styles.summaryHeadline}>{headline}</p>
        <dl className={styles.summaryList}>
          <div><dt>For</dt><dd>{forLabel}</dd></div>
          {assignmentType === 'questions' && (
            <>
              <div><dt>{testType === 'act' ? 'Categories' : 'Skills'}</dt><dd>{skillsLabel}</dd></div>
              <div><dt>{testType === 'act' ? 'Difficulty' : 'Score band'}</dt><dd>{levelText}</dd></div>
              <div><dt>Questions</dt><dd>{unattemptedOnly ? 'Unseen only' : 'Any'}</dd></div>
            </>
          )}
          <div><dt>Due</dt><dd>{dueDate ? formatCalendarDate(dueDate) : 'No due date'}</dd></div>
          {title && <div><dt>Title</dt><dd>{title}</dd></div>}
        </dl>

        {missing.length > 0 && (
          <p className={styles.summaryMissing}>Still needed: {missing.join(', ')}.</p>
        )}
        {state && !state.ok && <p role="alert" className={styles.error}>{state.error}</p>}

        <button
          type="submit"
          disabled={isPending || chosenPeople.length === 0 || (testType === 'act' && !actCatalog)}
          className={styles.submitButton}
        >
          {isPending ? 'Creating…' : 'Create assignment'}
        </button>

        {assignmentType === 'questions' && (
          <div className={styles.saveTemplate}>
            <label className={styles.checkInline}>
              <input type="checkbox" name="save_template" value="1" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} />
              <span>Also save as a template</span>
            </label>
            {saveTemplate && (
              <label className={styles.field}>
                <span className={styles.srOnly}>Template name</span>
                <input
                  name="template_name"
                  type="text"
                  maxLength={120}
                  required
                  placeholder={testType === 'act' ? 'e.g. ACT Math geometry, 10' : 'e.g. Algebra tune-up, 10 medium'}
                  className={styles.input}
                />
              </label>
            )}
          </div>
        )}
      </aside>
    </form>
  );
}
