// Admin · Content · Curriculum units — the Phase 3.4 content-
// production worklist. Materializes the §1.4 content-coverage audit
// as a living surface: every SAT curriculum unit with its published-
// question depth and lesson coverage, ranked weakest-coverage first,
// so "author one lesson per unit, weakest first" has a queue to work
// through instead of a plan paragraph.
//
// Lesson coverage is reported from two sources, both shown:
//   - lesson_topics → lessons: the real skill→lesson join (§3.3's
//     key). New lessons tagged to a unit's skill count here — and,
//     once published, flip get_plan_inputs.has_lesson (migration
//     20260717190000).
//   - lesson-pack proxy: lesson_pack_questions → questions_v2, the
//     legacy signal has_lesson relied on before real lessons carried
//     topics.
//
// Read-only by design — production happens in the lesson tools; this
// page just ranks and links the work.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { Table, Th, Td } from '@/lib/ui/Table';
import a from '../../../admin.module.css';

export const dynamic = 'force-dynamic';

interface UnitRow {
  id: string;
  domain_code: string;
  skill_code: string;
  title: string;
  sequence: number;
  expected_minutes: number;
}

interface TopicRow {
  skill_code: string | null;
  domain_name: string | null;
  lessons: { id: string; title: string | null; status: string | null } | Array<{
    id: string; title: string | null; status: string | null;
  }> | null;
}

interface UnitCoverage {
  unit: UnitRow;
  domainName: string;
  skillName: string;
  section: 'Math' | 'R&W';
  questionCount: number;
  publishedLessons: number;
  draftLessons: number;
  packCovered: boolean;
}

const DOMAIN_BY_CODE = new Map(SAT_TAXONOMY.map((d) => [d.code, d]));
const MATH_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

function skillNameFor(domainCode: string, skillCode: string): string {
  const domain = DOMAIN_BY_CODE.get(domainCode);
  return domain?.skills.find((s) => s.code === skillCode)?.name ?? skillCode;
}

/** Weakest coverage first: no published lesson, then no draft in
 *  flight, then no pack proxy, then thinnest question bank. Sequence
 *  is the deterministic tiebreak. */
function coverageOrder(x: UnitCoverage, y: UnitCoverage): number {
  const lessonDiff = Number(x.publishedLessons > 0) - Number(y.publishedLessons > 0);
  if (lessonDiff !== 0) return lessonDiff;
  const draftDiff = Number(x.draftLessons > 0) - Number(y.draftLessons > 0);
  if (draftDiff !== 0) return draftDiff;
  const packDiff = Number(x.packCovered) - Number(y.packCovered);
  if (packDiff !== 0) return packDiff;
  if (x.questionCount !== y.questionCount) return x.questionCount - y.questionCount;
  return x.unit.sequence - y.unit.sequence;
}

export default async function AdminContentUnitsPage() {
  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const [{ data: unitRows }, questionRows, { data: topicRows }, packRows] = await Promise.all([
    supabase
      .from('curriculum_units')
      .select('id, domain_code, skill_code, title, sequence, expected_minutes')
      .eq('test_type', 'sat')
      .order('sequence', { ascending: true }),
    // async wrapper: the Postgrest builder is a thenable, not a
    // Promise, and fetchAll's inferred signature wants a Promise.
    fetchAll(async (from, to) =>
      supabase
        .from('questions_v2')
        .select('domain_code, skill_code')
        .eq('is_published', true)
        .eq('is_broken', false)
        .is('deleted_at', null)
        .range(from, to),
    ),
    supabase
      .from('lesson_topics')
      .select('skill_code, domain_name, lessons(id, title, status)'),
    fetchAll(async (from, to) =>
      supabase
        .from('lesson_pack_questions')
        .select('question_id, questions_v2(domain_code, skill_code)')
        .range(from, to),
    ),
  ]);

  // Published-question depth per skill (skill codes are globally
  // unique across domains, so skill_code alone is a safe key).
  const questionCounts = new Map<string, number>();
  for (const q of questionRows as Array<{ skill_code: string | null }>) {
    if (!q.skill_code) continue;
    questionCounts.set(q.skill_code, (questionCounts.get(q.skill_code) ?? 0) + 1);
  }

  // Skill-level lesson tags. Domain-level tags (skill_code null) are
  // display chips, not unit coverage — ignored here, same as
  // get_plan_inputs.
  const lessonsBySkill = new Map<string, { published: number; draft: number }>();
  for (const t of (topicRows ?? []) as TopicRow[]) {
    if (!t.skill_code) continue;
    const lesson = Array.isArray(t.lessons) ? t.lessons[0] : t.lessons;
    if (!lesson) continue;
    const entry = lessonsBySkill.get(t.skill_code) ?? { published: 0, draft: 0 };
    if (lesson.status === 'published') entry.published += 1;
    else if (lesson.status === 'draft') entry.draft += 1;
    lessonsBySkill.set(t.skill_code, entry);
  }

  const packSkills = new Set<string>();
  for (const p of packRows as Array<{ questions_v2: { skill_code: string | null } | Array<{ skill_code: string | null }> | null }>) {
    const q = Array.isArray(p.questions_v2) ? p.questions_v2[0] : p.questions_v2;
    if (q?.skill_code) packSkills.add(q.skill_code);
  }

  const coverage: UnitCoverage[] = ((unitRows ?? []) as UnitRow[]).map((unit) => {
    const lessons = lessonsBySkill.get(unit.skill_code) ?? { published: 0, draft: 0 };
    return {
      unit,
      domainName: DOMAIN_BY_CODE.get(unit.domain_code)?.name ?? unit.domain_code,
      skillName: skillNameFor(unit.domain_code, unit.skill_code),
      section: (MATH_DOMAINS.has(unit.domain_code) ? 'Math' : 'R&W') as UnitCoverage['section'],
      questionCount: questionCounts.get(unit.skill_code) ?? 0,
      publishedLessons: lessons.published,
      draftLessons: lessons.draft,
      packCovered: packSkills.has(unit.skill_code),
    };
  }).sort(coverageOrder);

  const totalUnits = coverage.length;
  const withPublished = coverage.filter((c) => c.publishedLessons > 0).length;
  const withDraft = coverage.filter((c) => c.publishedLessons === 0 && c.draftLessons > 0).length;
  const totalQuestions = (questionRows as unknown[]).length;

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href="/admin/content">← Question content</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Content</div>
        <h1 className={a.h1}>Curriculum unit coverage</h1>
        <p className={a.sub}>
          The Phase 3.4 content worklist: every SAT curriculum unit with its
          question-bank depth and lesson coverage, weakest coverage first.
          Author lessons top-down — a published lesson tagged to the unit&rsquo;s
          skill counts toward plan generation immediately.
        </p>
        <p className={a.sub}>
          <strong>{withPublished} of {totalUnits}</strong> units have a published
          lesson{withDraft > 0 ? <> ({withDraft} more in draft)</> : null} ·{' '}
          {totalQuestions.toLocaleString()} published questions in the bank ·{' '}
          <Link href="/admin/lessons" className={a.link}>→ Lessons</Link>
        </p>
      </header>

      <section className={a.section}>
        <Table style={{ fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <Th>Unit</Th>
              <Th>Section</Th>
              <Th style={{ textAlign: 'right' }}>Questions</Th>
              <Th style={{ textAlign: 'center' }}>Lessons</Th>
              <Th style={{ textAlign: 'center' }}>Pack proxy</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {coverage.map((c) => (
              <tr key={c.unit.id}>
                <Td>
                  <div style={{ fontWeight: 600 }}>{c.unit.title}</div>
                  <div style={{ color: 'var(--fg3, #6b7280)', fontSize: '0.78rem' }}>
                    {c.domainName} · <code>{c.unit.skill_code}</code> {c.skillName !== c.unit.title ? `· ${c.skillName}` : ''}
                  </div>
                </Td>
                <Td>{c.section}</Td>
                <Td style={{ textAlign: 'right' }}>
                  {c.questionCount.toLocaleString()}
                  {c.questionCount < 20 && (
                    <span style={S.thinBadge}> thin</span>
                  )}
                </Td>
                <Td style={{ textAlign: 'center' }}>
                  {c.publishedLessons > 0 ? (
                    <span style={S.okBadge}>{c.publishedLessons} published</span>
                  ) : c.draftLessons > 0 ? (
                    <span style={S.draftBadge}>{c.draftLessons} draft</span>
                  ) : (
                    <span style={S.noneBadge}>none</span>
                  )}
                </Td>
                <Td style={{ textAlign: 'center' }}>{c.packCovered ? '✓' : '—'}</Td>
                <Td style={{ textAlign: 'right' }}>
                  <Link href="/admin/lessons/generate" className={a.link}>
                    Generate lesson →
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  thinBadge: {
    marginLeft: 6,
    padding: '1px 6px',
    borderRadius: 999,
    fontSize: '0.65rem',
    fontWeight: 700,
    background: '#fef3c7',
    color: '#92400e',
  },
  okBadge: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: '0.72rem',
    fontWeight: 600,
    background: '#dcfce7',
    color: '#166534',
  },
  draftBadge: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: '0.72rem',
    fontWeight: 600,
    background: '#e0e7ff',
    color: '#3730a3',
  },
  noneBadge: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: '0.72rem',
    fontWeight: 600,
    background: '#fee2e2',
    color: '#991b1b',
  },
};
