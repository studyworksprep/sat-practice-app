// Tutor · Tag questions · one unit — the per-unit technique tagging
// screen (docs/foundations-and-question-patterns.md §8.5 step B).
//
// Lives in the tutor tree rather than under /admin/curriculum because
// the (admin) layout redirects managers, and tagging is meant to be
// shared work: any manager or admin can take a unit. Admins reach it
// from the Curriculum pages; managers from their sidebar.
//
// Server Component: loads the unit, the light list of its published
// standard-pool questions with their explicit tags, the technique
// catalog, and the first question's view-model. Everything after the
// first question is fetched by the island through ./actions.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { loadQuestionTechniqueIds, loadTechniqueCatalog } from '@/lib/practice/load-question-techniques';
import { loadTaggingQuestionVM } from '@/lib/practice/tagging-question';
import { orderQuestionsForTagging, type TaggingListItem } from '@/lib/practice/tagging-order';
import { TaggingScreen } from './TaggingScreen';
import s from '../Tagging.module.css';

export const dynamic = 'force-dynamic';

const MATH_DOMAINS = new Set(['H', 'P', 'Q', 'S']);
const DOMAIN_BY_CODE = new Map(SAT_TAXONOMY.map((d) => [d.code, d]));

export default async function TaggingUnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const { profile, supabase } = await requireUser();
  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (profile.role === 'teacher') redirect('/tutor/dashboard');
  if (!['manager', 'admin'].includes(profile.role)) redirect('/');

  const { data: unit } = await supabase
    .from('curriculum_units')
    .select('id, title, domain_code, skill_code, sequence')
    .eq('id', unitId)
    .eq('test_type', 'sat')
    .maybeSingle();
  if (!unit) notFound();

  const [questionRows, techniques] = await Promise.all([
    fetchAll(async (from, to) =>
      supabase
        .from('questions_v2')
        .select('id, display_code, difficulty')
        .eq('skill_code', unit.skill_code)
        .eq('is_published', true)
        .eq('is_broken', false)
        .is('deleted_at', null)
        // Opt-in import batches are student-invisible; tagging them
        // would be wasted work.
        .eq('pool', 'standard')
        .order('display_code', { ascending: true })
        .range(from, to),
    ),
    loadTechniqueCatalog({ role: profile.role }),
  ]);
  const rows = questionRows as Array<{ id: string; display_code: string | null; difficulty: number | null }>;
  const tagsByQid = await loadQuestionTechniqueIds({ questionIds: rows.map((r) => r.id) });
  const questions: TaggingListItem[] = rows.map((r) => ({
    id: r.id,
    displayCode: r.display_code,
    difficulty: r.difficulty,
    techniqueIds: tagsByQid.get(r.id) ?? [],
  }));

  const firstId = orderQuestionsForTagging(questions, 'untagged_first')[0];
  const initialQuestion = firstId ? await loadTaggingQuestionVM(supabase, firstId) : null;

  const domain = DOMAIN_BY_CODE.get(unit.domain_code);
  const skillName = domain?.skills.find((sk) => sk.code === unit.skill_code)?.name ?? unit.skill_code;
  const section = MATH_DOMAINS.has(unit.domain_code) ? 'math' : 'reading_writing';
  const tagged = questions.filter((q) => q.techniqueIds.length > 0).length;

  return (
    <main className={s.container}>
      <nav className={s.breadcrumb}>
        <Link href="/tutor/tagging">&larr; All units</Link>
        {profile.role === 'admin' && (
          <>
            {' · '}
            <Link href={`/admin/curriculum/${unit.id}`}>Edit this unit&rsquo;s syllabus</Link>
          </>
        )}
      </nav>
      <header className={s.header}>
        <div>
          <div className={s.eyebrow}>
            Tag questions · Unit {unit.sequence} · {section === 'math' ? 'Math' : 'Reading & Writing'} ·{' '}
            {domain?.name ?? unit.domain_code}
          </div>
          <h1 className={s.h1}>{unit.title}</h1>
          <p className={s.sub}>
            For each question, tick the technique(s) you would actually use to solve it. Tagged questions
            come first in the practice set after a lesson that teaches that technique.{' '}
            {tagged} of {questions.length} tagged so far.
          </p>
        </div>
      </header>

      <TaggingScreen
        unit={{
          id: unit.id,
          title: unit.title,
          skillCode: unit.skill_code,
          skillName,
          domainName: domain?.name ?? unit.domain_code,
          section,
        }}
        techniques={techniques ?? []}
        questions={questions}
        initialQuestion={initialQuestion}
        indexHref="/tutor/tagging"
        catalogHref={profile.role === 'admin' ? '/admin/techniques' : null}
      />
    </main>
  );
}
