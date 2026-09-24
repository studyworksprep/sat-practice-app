// Admin · Curriculum · a section's foundation syllabus — "Before Math"
// or "Before Reading & Writing" (docs/foundations-and-question-
// patterns.md §8.1 decision 6, §8.5 step D). Same editor as a unit,
// scoped to a section: the lessons here are the tools (Desmos
// regression, the passage strategy) every student gets before the
// section's first unit; unit lessons are the applications.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { UnitEditor, type EditorLesson, type EditorStep, type EditorTechnique } from '../../[unitId]/UnitEditor';
import a from '../../../../admin.module.css';

export const dynamic = 'force-dynamic';

const SECTION_TITLE: Record<'math' | 'reading_writing', string> = {
  math: 'Before Math',
  reading_writing: 'Before Reading & Writing',
};
const SECTION_LABEL: Record<'math' | 'reading_writing', string> = {
  math: 'Math',
  reading_writing: 'Reading & Writing',
};
/** Default minutes for a foundation step (a tool lesson runs shorter
 *  than a unit). */
const FOUNDATION_MINUTES = 30;

function skillName(skillCode: string): string {
  for (const d of SAT_TAXONOMY) {
    const s = d.skills.find((x) => x.code === skillCode);
    if (s) return s.name;
  }
  return skillCode;
}

export default async function CurriculumSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: raw } = await params;
  if (raw !== 'math' && raw !== 'reading_writing') notFound();
  const section = raw;
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const [{ data: stepRows }, { data: lessonRows }, { data: topicRows }, { data: usageRows }, { data: techniqueRows }, { data: allUnits }] =
    await Promise.all([
      supabase
        .from('curriculum_unit_steps')
        .select('id, position, kind, lesson_id, role, skill_codes, technique_ids, technique_source, question_count, minutes, skip_if_completed, lesson:lessons(title, status, lesson_techniques(technique_id))')
        .eq('section', section)
        .eq('test_type', 'sat')
        .is('unit_id', null)
        .order('position', { ascending: true }),
      supabase
        .from('lessons')
        .select('id, title, status, kind, description')
        .in('status', ['published', 'draft'])
        .order('title', { ascending: true }),
      supabase.from('lesson_topics').select('lesson_id, skill_code').not('skill_code', 'is', null),
      supabase.from('curriculum_unit_steps').select('lesson_id, unit_id, section').eq('kind', 'lesson'),
      supabase
        .from('techniques')
        .select('id, name, description, section, technique_skills(skill_code)')
        .eq('test_type', 'sat')
        .order('section', { ascending: true, nullsFirst: true })
        .order('sequence', { ascending: true })
        .order('name', { ascending: true }),
      supabase.from('curriculum_units').select('id, title').eq('test_type', 'sat'),
    ]);

  const unitTitle = new Map((allUnits ?? []).map((u) => [u.id, u.title]));
  const skillsByLesson = new Map<string, string[]>();
  for (const t of topicRows ?? []) {
    if (!t.skill_code) continue;
    const list = skillsByLesson.get(t.lesson_id) ?? [];
    if (!list.includes(t.skill_code)) list.push(t.skill_code);
    skillsByLesson.set(t.lesson_id, list);
  }
  // "Also in": the units (and the other section) already using a lesson.
  const usedByLesson = new Map<string, string[]>();
  for (const u of usageRows ?? []) {
    if (!u.lesson_id) continue;
    const where = u.unit_id
      ? unitTitle.get(u.unit_id)
      : u.section && u.section !== section
        ? SECTION_TITLE[u.section as 'math' | 'reading_writing']
        : null;
    if (!where) continue;
    const list = usedByLesson.get(u.lesson_id) ?? [];
    if (!list.includes(where)) list.push(where);
    usedByLesson.set(u.lesson_id, list);
  }

  const techniques: EditorTechnique[] = (techniqueRows ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    section: t.section === 'math' || t.section === 'reading_writing' ? t.section : null,
    skillCodes: (t.technique_skills ?? []).map((s) => s.skill_code),
  }));
  const techniqueName = new Map(techniques.map((t) => [t.id, t.name]));
  type LessonEmbed = { title: string; status: string; lesson_techniques: Array<{ technique_id: string }> | null };
  const steps: EditorStep[] = (stepRows ?? []).map((r) => {
    const lesson = (Array.isArray(r.lesson) ? r.lesson[0] : r.lesson) as LessonEmbed | null;
    const techniqueIds: string[] =
      r.kind === 'lesson'
        ? (lesson?.lesson_techniques ?? []).map((t) => t.technique_id)
        : r.technique_ids && r.technique_ids.length > 0
          ? r.technique_ids
          : [];
    return {
      id: r.id,
      position: r.position,
      kind: r.kind === 'lesson' ? 'lesson' : 'drill',
      lessonId: r.lesson_id,
      lessonTitle: lesson?.title ?? null,
      lessonStatus: lesson?.status ?? null,
      role: r.role === 'mixed' ? 'mixed' : r.role === 'practice' ? 'practice' : null,
      skillCodes: r.skill_codes,
      techniqueIds: techniqueIds.length > 0 ? techniqueIds : null,
      techniqueNames: techniqueIds.map((id) => techniqueName.get(id)).filter((n): n is string => Boolean(n)),
      techniqueSource: r.technique_source === 'none' || r.technique_source === 'explicit' ? r.technique_source : 'lesson',
      questionCount: r.question_count,
      minutes: r.minutes,
      skipIfCompleted: r.skip_if_completed,
    };
  });
  // Foundation-kind lessons are the natural candidates and list first.
  const lessons: EditorLesson[] = (lessonRows ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    status: l.status,
    kind: l.kind,
    description: l.description,
    skills: (skillsByLesson.get(l.id) ?? []).map(skillName),
    taggedToUnit: l.kind === 'foundation',
    otherUnits: usedByLesson.get(l.id) ?? [],
  }));

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <Link href="/admin/curriculum">&larr; Curriculum</Link>
      </nav>
      <header className={a.header}>
        <div className={a.eyebrow}>Foundations · {SECTION_LABEL[section]}</div>
        <h1 className={a.h1}>{SECTION_TITLE[section]}</h1>
        <p className={a.sub}>
          The tools every student learns before their first {SECTION_LABEL[section]}{' '}
          unit &mdash; how a technique works, taught once. Unit lessons then apply it. Study plans put these steps before
          the section&rsquo;s first topic and skip any lesson a student has already completed.
        </p>
        <p className={a.sub}>
          A practice set after a foundation draws from the skills its techniques apply to; a mixed set
          draws from the whole section.
        </p>
      </header>

      <UnitEditor
        unit={{
          scope: 'section',
          id: section,
          section,
          domainCode: '',
          domainName: SECTION_LABEL[section],
          skillCode: '',
          skillName: SECTION_LABEL[section],
          title: SECTION_TITLE[section],
          expectedMinutes: FOUNDATION_MINUTES,
          authoredAt: null,
        }}
        steps={steps}
        lessons={lessons}
        techniques={techniques}
        suggestedLabel="Foundation lessons"
      />
    </main>
  );
}
