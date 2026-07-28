// Admin · Content · Question-pattern catalog for one skill
// (docs/foundations-and-question-patterns.md §3.4 step 2).
//
// The curated "see this format → run this process" sub-skill catalog:
// 2–6 patterns per skill, each with a one-sentence recognition cue
// (the highest-value artifact — it becomes UI copy, the classifier
// prompt, and the lesson's opening line) and a short process summary.
// Per-pattern classified-question counts show how much of the bank
// each pattern explains; classification itself happens in the
// AI-assisted queue, not here.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { savePattern, deletePattern } from './actions';
import { PatternCatalog } from './PatternCatalog';
import a from '../../../../admin.module.css';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ skillCode: string }>;
}

function findSkill(skillCode: string) {
  for (const domain of SAT_TAXONOMY) {
    const skill = domain.skills.find((s) => s.code === skillCode);
    if (skill) return { domain, skill };
  }
  return null;
}

export default async function AdminSkillPatternsPage({ params }: PageProps) {
  const { skillCode: rawCode } = await params;
  const skillCode = decodeURIComponent(rawCode);

  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const found = findSkill(skillCode);
  if (!found) notFound();

  const [{ data: patterns }, { count: skillQuestionCount }, { data: classifiedRows }] =
    await Promise.all([
      supabase
        .from('question_patterns')
        .select('id, name, recognition_cue, process_summary, sequence')
        .eq('test_type', 'sat')
        .eq('skill_code', skillCode)
        .order('sequence', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('questions_v2')
        .select('id', { count: 'exact', head: true })
        .eq('is_published', true)
        .eq('is_broken', false)
        .is('deleted_at', null)
        .eq('skill_code', skillCode),
      supabase
        .from('questions_v2')
        .select('pattern_id')
        .eq('is_published', true)
        .eq('is_broken', false)
        .is('deleted_at', null)
        .eq('skill_code', skillCode)
        .not('pattern_id', 'is', null),
    ]);

  const classifiedCounts = new Map<string, number>();
  for (const row of classifiedRows ?? []) {
    if (!row.pattern_id) continue;
    classifiedCounts.set(row.pattern_id, (classifiedCounts.get(row.pattern_id) ?? 0) + 1);
  }

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <Link href="/admin/content/units">← Curriculum units</Link>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Content · Question patterns</div>
        <h1 className={a.h1}>{found.skill.name}</h1>
        <p className={a.sub}>
          {found.domain.name} · <code>{skillCode}</code> ·{' '}
          {(skillQuestionCount ?? 0).toLocaleString()} published questions
        </p>
        <p className={a.sub}>
          Patterns are the &ldquo;when you see this format, run this
          process&rdquo; grain beneath the skill — aim for 2–6, each
          recognizable from the question alone <em>before</em>{' '}
          solving. The
          recognition cue is the highest-value line: it becomes the
          classifier prompt and the pattern lesson&rsquo;s opening. Questions
          matching no pattern stay unclassified — never force 100% coverage.
        </p>
      </header>

      <PatternCatalog
        skillCode={skillCode}
        patterns={(patterns ?? []).map((p) => ({
          ...p,
          classified_count: classifiedCounts.get(p.id) ?? 0,
        }))}
        totalQuestions={skillQuestionCount ?? 0}
        actions={{ save: savePattern, remove: deletePattern }}
      />
    </main>
  );
}
