// Admin · Curriculum · one unit. Loads the unit, its steps, the lesson
// bank (with each lesson's tagged skills and the other units already
// using it), and the technique catalog, and hands them to the
// UnitEditor island.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { UnitEditor, type EditorLesson, type EditorStep, type EditorTechnique } from './UnitEditor';
import a from '../../../admin.module.css';

export const dynamic = 'force-dynamic';

const DOMAIN_BY_CODE = new Map(SAT_TAXONOMY.map((d) => [d.code, d]));
const MATH_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

function skillName(skillCode: string): string {
  for (const d of SAT_TAXONOMY) {
    const s = d.skills.find((x) => x.code === skillCode);
    if (s) return s.name;
  }
  return skillCode;
}

export default async function CurriculumUnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const { data: unit } = await supabase
    .from('curriculum_units')
    .select('id, domain_code, skill_code, title, sequence, expected_minutes, syllabus_authored_at')
    .eq('id', unitId)
    .maybeSingle();
  if (!unit) notFound();

  const [{ data: stepRows }, { data: lessonRows }, { data: topicRows }, { data: usageRows }, { data: techniqueRows }, { data: allUnits }, { count: questionTotal }, { data: tagRows }] =
    await Promise.all([
      supabase
        .from('curriculum_unit_steps')
        .select('id, position, kind, lesson_id, role, skill_codes, technique_ids, question_count, minutes, skip_if_completed, lesson:lessons(title, status)')
        .eq('unit_id', unit.id)
        .order('position', { ascending: true }),
      supabase
        .from('lessons')
        .select('id, title, status, kind, description')
        .in('status', ['published', 'draft'])
        .order('title', { ascending: true }),
      supabase.from('lesson_topics').select('lesson_id, skill_code').not('skill_code', 'is', null),
      supabase.from('curriculum_unit_steps').select('lesson_id, unit_id').eq('kind', 'lesson'),
      supabase
        .from('techniques')
        .select('id, name, description, section, technique_skills(skill_code)')
        .eq('test_type', 'sat')
        .order('section', { ascending: true, nullsFirst: true })
        .order('sequence', { ascending: true })
        .order('name', { ascending: true }),
      supabase.from('curriculum_units').select('id, title').eq('test_type', 'sat'),
      // Tagging progress for the header link (published, unbroken,
      // standard pool — what the tagging screen lists).
      supabase
        .from('questions_v2')
        .select('id', { count: 'exact', head: true })
        .eq('skill_code', unit.skill_code)
        .eq('is_published', true)
        .eq('is_broken', false)
        .is('deleted_at', null)
        .eq('pool', 'standard'),
      supabase
        .from('question_techniques')
        .select('question_id, question:questions_v2!inner(skill_code, is_published, is_broken, deleted_at, pool)')
        .eq('question.skill_code', unit.skill_code),
    ]);
  const taggedQuestions = new Set(
    ((tagRows ?? []) as unknown as Array<{
      question_id: string;
      question: { is_published: boolean; is_broken: boolean; deleted_at: string | null; pool: string } | null;
    }>)
      .filter((r) => r.question && r.question.is_published && !r.question.is_broken && !r.question.deleted_at && r.question.pool === 'standard')
      .map((r) => r.question_id),
  ).size;

  const unitTitle = new Map((allUnits ?? []).map((u) => [u.id, u.title]));
  const skillsByLesson = new Map<string, string[]>();
  for (const t of topicRows ?? []) {
    if (!t.skill_code) continue;
    const list = skillsByLesson.get(t.lesson_id) ?? [];
    if (!list.includes(t.skill_code)) list.push(t.skill_code);
    skillsByLesson.set(t.lesson_id, list);
  }
  const unitsByLesson = new Map<string, string[]>();
  for (const u of usageRows ?? []) {
    if (!u.lesson_id || u.unit_id === unit.id) continue;
    const list = unitsByLesson.get(u.lesson_id) ?? [];
    const title = unitTitle.get(u.unit_id);
    if (title && !list.includes(title)) list.push(title);
    unitsByLesson.set(u.lesson_id, list);
  }

  const techniques: EditorTechnique[] = (techniqueRows ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    section: t.section === 'math' || t.section === 'reading_writing' ? t.section : null,
    skillCodes: (t.technique_skills ?? []).map((s) => s.skill_code),
  }));
  const techniqueName = new Map(techniques.map((t) => [t.id, t.name]));
  const steps: EditorStep[] = (stepRows ?? []).map((r) => {
    const lesson = Array.isArray(r.lesson) ? r.lesson[0] : r.lesson;
    return {
      id: r.id,
      position: r.position,
      kind: r.kind === 'lesson' ? 'lesson' : 'drill',
      lessonId: r.lesson_id,
      lessonTitle: lesson?.title ?? null,
      lessonStatus: lesson?.status ?? null,
      role: r.role === 'mixed' ? 'mixed' : r.role === 'practice' ? 'practice' : null,
      skillCodes: r.skill_codes,
      techniqueIds: r.technique_ids && r.technique_ids.length > 0 ? r.technique_ids : null,
      techniqueNames: (r.technique_ids ?? []).map((id) => techniqueName.get(id)).filter((n): n is string => Boolean(n)),
      questionCount: r.question_count,
      minutes: r.minutes,
      skipIfCompleted: r.skip_if_completed,
    };
  });
  const lessons: EditorLesson[] = (lessonRows ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    status: l.status,
    kind: l.kind,
    description: l.description,
    skills: (skillsByLesson.get(l.id) ?? []).map(skillName),
    taggedToUnit: (skillsByLesson.get(l.id) ?? []).includes(unit.skill_code),
    otherUnits: unitsByLesson.get(l.id) ?? [],
  }));

  const domain = DOMAIN_BY_CODE.get(unit.domain_code);

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <Link href="/admin/curriculum">&larr; Curriculum</Link>
      </nav>
      <header className={a.header}>
        <div className={a.eyebrow}>
          Unit {unit.sequence} · {MATH_DOMAINS.has(unit.domain_code) ? 'Math' : 'Reading & Writing'} · {domain?.name ?? unit.domain_code}
        </div>
        <h1 className={a.h1}>{unit.title}</h1>
        <p className={a.sub}>
          Build this unit the way you teach it: a lesson, then practice on it, the next lesson, then
          practice, and a mixed set to finish. Students see the steps in this order.
        </p>
        <p className={a.sub}>
          <Link href={`/tutor/tagging/${unit.id}`} className={a.link}>
            Tag this unit&rsquo;s questions by technique &rarr;
          </Link>{' '}
          {taggedQuestions} of {questionTotal ?? 0} tagged.
        </p>
      </header>

      <UnitEditor
        unit={{
          id: unit.id,
          domainCode: unit.domain_code,
          domainName: domain?.name ?? unit.domain_code,
          skillCode: unit.skill_code,
          skillName: skillName(unit.skill_code),
          title: unit.title,
          expectedMinutes: unit.expected_minutes,
          authoredAt: unit.syllabus_authored_at,
        }}
        steps={steps}
        lessons={lessons}
        techniques={techniques}
      />
    </main>
  );
}
