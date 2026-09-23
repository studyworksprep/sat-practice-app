// Admin · Content · Curriculum units · one unit's syllabus
// (docs/foundations-and-question-patterns.md §7). The ordered steps the
// plan generator walks for this unit: lessons in teaching order, each
// followed by its practice drill, mixed sets at the end. Server
// Component loads the unit, its steps, the lesson bank, and the unit's
// pattern catalog; SyllabusEditor is the client island that mutates
// through ./syllabus-actions and refreshes.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { SyllabusEditor, type EditorLesson, type EditorPattern, type EditorStep } from './SyllabusEditor';
import a from '../../../../../admin.module.css';

export const dynamic = 'force-dynamic';

const DOMAIN_BY_CODE = new Map(SAT_TAXONOMY.map((d) => [d.code, d]));
const MATH_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

export default async function UnitSyllabusPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const { data: unit } = await supabase
    .from('curriculum_units')
    .select('id, test_type, domain_code, skill_code, title, sequence, expected_minutes, syllabus_authored_at')
    .eq('id', unitId)
    .maybeSingle();
  if (!unit) notFound();

  const [{ data: stepRows }, { data: lessonRows }, { data: patternRows }] = await Promise.all([
    supabase
      .from('curriculum_unit_steps')
      .select(
        'id, position, kind, lesson_id, role, skill_codes, pattern_id, question_count, minutes, skip_if_completed, lesson:lessons(title, status)',
      )
      .eq('unit_id', unit.id)
      .order('position', { ascending: true }),
    supabase
      .from('lessons')
      .select('id, title, status, kind')
      .in('status', ['published', 'draft'])
      .order('title', { ascending: true }),
    supabase
      .from('question_patterns')
      .select('id, name')
      .eq('skill_code', unit.skill_code)
      .order('sequence', { ascending: true }),
  ]);

  const patterns: EditorPattern[] = patternRows ?? [];
  const patternName = new Map(patterns.map((p) => [p.id, p.name]));
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
      patternId: r.pattern_id,
      patternName: r.pattern_id ? (patternName.get(r.pattern_id) ?? null) : null,
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
  }));

  const domain = DOMAIN_BY_CODE.get(unit.domain_code);
  const skillName = domain?.skills.find((s) => s.code === unit.skill_code)?.name ?? unit.skill_code;

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <Link href="/admin/content/units?view=syllabi">&larr; Curriculum units</Link>
      </nav>
      <header className={a.header}>
        <div className={a.eyebrow}>
          Admin · Content · Unit {unit.sequence} · {MATH_DOMAINS.has(unit.domain_code) ? 'Math' : 'R&W'} ·{' '}
          {domain?.name ?? unit.domain_code}
        </div>
        <h1 className={a.h1}>
          {unit.title} <code style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--fg3, #6b7280)' }}>{unit.skill_code}</code>
        </h1>
        <p className={a.sub}>
          {skillName !== unit.title ? <>{skillName} · </> : null}
          The steps a plan walks for this unit, in teaching order: a lesson, the practice set that
          exercises it, the next lesson, its practice set, then a mixed set. There is no intro drill
          &mdash; the lesson&rsquo;s own checks are the examples.
        </p>
        <p className={a.help}>
          A lesson used in several units is taught once: later units skip it for a student who has
          completed it (or keep it, per step). Drills with no skill list draw from this unit&rsquo;s
          skill; a mixed set with no list spans the domain&rsquo;s units the plan has walked so far.
          Plans only walk syllabi while the <code>unit_syllabus</code> flag is on.
        </p>
      </header>

      <SyllabusEditor
        unit={{
          id: unit.id,
          domainCode: unit.domain_code,
          skillCode: unit.skill_code,
          title: unit.title,
          expectedMinutes: unit.expected_minutes,
          authoredAt: unit.syllabus_authored_at,
        }}
        steps={steps}
        lessons={lessons}
        patterns={patterns}
      />
    </main>
  );
}
