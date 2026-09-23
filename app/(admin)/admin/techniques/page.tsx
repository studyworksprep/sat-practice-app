// Admin · Techniques — the technique catalog
// (docs/foundations-and-question-patterns.md §8).
//
// A technique is HOW a question is solved: graphing to x-intercepts,
// regression, Desmos lists, plugging in answers, Good Cop Bad Cop. It
// is the second axis of the curriculum, beside content (the 29 SAT
// skills, which stay the spine): a technique cuts across skills, and
// one question is often solvable by several. A technique applies by
// default to every question in its default skills, and questions can
// be tagged individually on top.
//
// Read-side counts (tagged questions, lessons that teach it, syllabus
// steps that narrow to it) are loaded here so a delete confirm can
// state its real cost and an unused technique is visibly unused.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { Table, Th, Td } from '@/lib/ui/Table';
import type { TechniqueSection } from '@/lib/admin/techniques';
import { TechniqueCatalogManager, type SectionGroup, type TechniqueRow } from './TechniqueCatalogManager';
import a from '../../admin.module.css';

export const dynamic = 'force-dynamic';

interface TechniqueRecord {
  id: string;
  name: string;
  description: string;
  process_summary: string | null;
  section: string | null;
  sequence: number;
  technique_skills: Array<{ skill_code: string }> | { skill_code: string } | null;
}

export default async function AdminTechniquesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const [techniqueRows, tagRows, lessonRows, { data: stepRows }, { data: recentRows }] = await Promise.all([
    fetchAll(async (from, to) =>
      supabase
        .from('techniques')
        .select('id, name, description, process_summary, section, sequence, technique_skills(skill_code)')
        .eq('test_type', 'sat')
        .order('section', { ascending: true, nullsFirst: true })
        .order('sequence', { ascending: true })
        .order('name', { ascending: true })
        .range(from, to),
    ),
    fetchAll(async (from, to) => supabase.from('question_techniques').select('technique_id').range(from, to)),
    fetchAll(async (from, to) => supabase.from('lesson_techniques').select('technique_id').range(from, to)),
    supabase.from('curriculum_unit_steps').select('technique_ids').not('technique_ids', 'is', null),
    // Audit trail for the review-surface pickers: tagging spreads across
    // many hands, so admins need a spot-check queue.
    supabase
      .from('question_techniques')
      .select('question_id, technique_id, tagged_by, tagged_at, question:questions_v2(display_code)')
      .order('tagged_at', { ascending: false })
      .limit(12),
  ]);

  const count = (rows: unknown[], key: 'technique_id') => {
    const out = new Map<string, number>();
    for (const r of rows as Array<Record<string, string | null>>) {
      const id = r[key];
      if (id) out.set(id, (out.get(id) ?? 0) + 1);
    }
    return out;
  };
  const questionCounts = count(tagRows, 'technique_id');
  const lessonCounts = count(lessonRows, 'technique_id');
  const stepCounts = new Map<string, number>();
  for (const r of (stepRows ?? []) as Array<{ technique_ids: string[] | null }>) {
    for (const id of r.technique_ids ?? []) stepCounts.set(id, (stepCounts.get(id) ?? 0) + 1);
  }

  const techniques: TechniqueRow[] = (techniqueRows as TechniqueRecord[]).map((t) => {
    const skills = Array.isArray(t.technique_skills) ? t.technique_skills : t.technique_skills ? [t.technique_skills] : [];
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      process_summary: t.process_summary,
      section: (t.section === 'math' || t.section === 'reading_writing' ? t.section : null) as TechniqueSection | null,
      sequence: t.sequence,
      skillCodes: skills.map((s) => s.skill_code),
      questionCount: questionCounts.get(t.id) ?? 0,
      lessonCount: lessonCounts.get(t.id) ?? 0,
      stepCount: stepCounts.get(t.id) ?? 0,
    };
  });

  const groups: SectionGroup[] = (['math', 'reading_writing', null] as Array<TechniqueSection | null>)
    .map((section) => ({ section, techniques: techniques.filter((t) => t.section === section) }))
    .filter((g) => g.techniques.length > 0);

  // Tagger names for the audit strip.
  const recent = (recentRows ?? []) as Array<{
    question_id: string;
    technique_id: string;
    tagged_by: string | null;
    tagged_at: string;
    question: { display_code: string | null } | Array<{ display_code: string | null }> | null;
  }>;
  const taggerIds = [...new Set(recent.map((r) => r.tagged_by).filter((id): id is string => Boolean(id)))];
  const { data: taggerRows } = taggerIds.length
    ? await supabase.from('profiles').select('id, first_name, last_name, tutor_name').in('id', taggerIds)
    : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null; tutor_name: string | null }> };
  const taggerNames = new Map(
    (taggerRows ?? []).map((p) => [p.id, (p.tutor_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || '').trim()]),
  );
  const techniqueNames = new Map(techniques.map((t) => [t.id, t.name]));
  const tagged = techniques.reduce((n, t) => n + t.questionCount, 0);

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <Link href="/admin/curriculum">&larr; Curriculum</Link>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin</div>
        <h1 className={a.h1}>Techniques</h1>
        <p className={a.sub}>
          How questions get solved: graphing to the x-intercepts, regression, plugging in the answers,
          Good Cop Bad Cop. A technique cuts across skills, and one question can be solved by several. Lessons
          teach techniques, and the practice set after a lesson drills the unit&rsquo;s questions for the
          technique just taught.
        </p>
        <p className={a.sub}>
          <strong>{techniques.length}</strong> technique{techniques.length === 1 ? '' : 's'} ·{' '}
          {tagged.toLocaleString()} question tag{tagged === 1 ? '' : 's'} ·{' '}
          <Link href="/admin/curriculum" className={a.link}>Curriculum</Link> ·{' '}
          <Link href="/admin/lessons" className={a.link}>Lessons</Link>
        </p>
        <p className={a.help}>
          Each technique says <em>when to use it</em> in the words a student would recognize, and lists the
          skills where every question counts by default. Tag the rest question by question on the{' '}
          <Link href="/tutor/tagging" className={a.link}>tagging screens</Link> or from any review page.
        </p>
      </header>

      {recent.length > 0 && (
        <section className={a.section}>
          <h2 className={a.h2}>Recently tagged</h2>
          <p className={a.sub} style={{ marginBottom: '0.75rem' }}>
            Tags applied from the review surfaces, newest first. Spot-check these &mdash; a tag applied from a
            stale &ldquo;when to use it&rdquo; is the failure mode worth catching early.
          </p>
          <Table style={{ fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <Th>Question</Th>
                <Th>Technique</Th>
                <Th>Tagged by</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => {
                const q = Array.isArray(row.question) ? row.question[0] : row.question;
                return (
                  <tr key={`${row.question_id}-${row.technique_id}`}>
                    <Td style={{ fontFamily: 'monospace' }}>
                      <Link href={`/admin/questions/${row.question_id}`} className={a.link}>
                        {q?.display_code ?? row.question_id.slice(0, 8)}
                      </Link>
                    </Td>
                    <Td>{techniqueNames.get(row.technique_id) ?? 'Removed technique'}</Td>
                    <Td>{(row.tagged_by && taggerNames.get(row.tagged_by)) || '—'}</Td>
                    {/* ISO slice, not toLocaleString: locale output can
                        differ between the SSR pass and hydration. */}
                    <Td style={{ color: 'var(--fg3, #6b7280)' }}>{row.tagged_at.slice(0, 16).replace('T', ' ')}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </section>
      )}

      <TechniqueCatalogManager groups={groups} startCreating={sp.new === '1'} />
    </main>
  );
}
