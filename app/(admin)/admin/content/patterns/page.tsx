// Admin · Content · Question patterns — the pattern-catalog editor
// (docs/foundations-and-question-patterns.md §3.4 step 2).
//
// question_patterns is the sub-skill grain the pedagogy loop was
// missing: "when you see this format, run this process", narrower than
// a skill and coarser than a single question. Migration
// 20260727190000 created the table and its admin RLS; this page is the
// surface that finally fills it, replacing "an admin runs SQL".
//
// Sits under /admin/content next to the units worklist because the two
// are the same job at different grains — the units page ranks skills by
// coverage, this page breaks a skill into the formats actually taught.
// The units worklist deep-links here per row via ?skill=.
//
// Read-side counts (questions carrying the pattern, lesson scope tags
// pointing at it) are loaded here rather than in the client so a
// delete confirm can state its real cost, and so an unused pattern is
// visibly unused.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { PatternCatalogManager, type PatternRow, type SkillGroup } from './PatternCatalogManager';
import { PatternImportPanel, type ExportablePattern } from './PatternImportPanel';
import a from '../../../admin.module.css';

export const dynamic = 'force-dynamic';

const DOMAIN_BY_CODE = new Map(SAT_TAXONOMY.map((d) => [d.code, d]));
const MATH_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

interface PatternRecord {
  id: string;
  test_type: string;
  domain_code: string;
  skill_code: string;
  name: string;
  recognition_cue: string;
  process_summary: string | null;
  sequence: number;
  updated_at: string | null;
}

function skillNameFor(domainCode: string, skillCode: string): string {
  return DOMAIN_BY_CODE.get(domainCode)?.skills.find((s) => s.code === skillCode)?.name ?? skillCode;
}

export default async function AdminQuestionPatternsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const initialSkill = typeof sp.skill === 'string' ? sp.skill : '';
  // Resolved here so the client can scope a fresh create form to the
  // skill the units worklist linked in for.
  const initialDomain = initialSkill
    ? (SAT_TAXONOMY.find((d) => d.skills.some((s) => s.code === initialSkill))?.code ?? '')
    : '';

  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const [patternRows, questionRows, topicRows] = await Promise.all([
    fetchAll(async (from, to) =>
      supabase
        .from('question_patterns')
        .select(
          'id, test_type, domain_code, skill_code, name, recognition_cue, process_summary, sequence, updated_at',
        )
        .order('domain_code', { ascending: true })
        .order('skill_code', { ascending: true })
        .order('sequence', { ascending: true })
        .range(from, to),
    ),
    // Only the classified questions — an unclassified bank is the norm
    // and pulling it whole would be pointless volume.
    fetchAll(async (from, to) =>
      supabase
        .from('questions_v2')
        .select('pattern_id')
        .not('pattern_id', 'is', null)
        .is('deleted_at', null)
        .range(from, to),
    ),
    fetchAll(async (from, to) =>
      supabase.from('lesson_topics').select('pattern_id').not('pattern_id', 'is', null).range(from, to),
    ),
  ]);

  const patterns = patternRows as PatternRecord[];

  const questionCounts = new Map<string, number>();
  for (const q of questionRows as Array<{ pattern_id: string | null }>) {
    if (!q.pattern_id) continue;
    questionCounts.set(q.pattern_id, (questionCounts.get(q.pattern_id) ?? 0) + 1);
  }

  const lessonCounts = new Map<string, number>();
  for (const t of topicRows as Array<{ pattern_id: string | null }>) {
    if (!t.pattern_id) continue;
    lessonCounts.set(t.pattern_id, (lessonCounts.get(t.pattern_id) ?? 0) + 1);
  }

  // Group into per-skill teaching lists. Insertion order follows the
  // query's (domain, skill, sequence) sort, so groups come out in
  // taxonomy order and patterns in teaching order without re-sorting.
  const groups = new Map<string, SkillGroup>();
  for (const p of patterns) {
    const key = `${p.domain_code}::${p.skill_code}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        domainCode: p.domain_code,
        domainName: DOMAIN_BY_CODE.get(p.domain_code)?.name ?? p.domain_code,
        skillCode: p.skill_code,
        skillName: skillNameFor(p.domain_code, p.skill_code),
        section: MATH_DOMAINS.has(p.domain_code) ? 'Math' : 'R&W',
        patterns: [],
      };
      groups.set(key, group);
    }
    const row: PatternRow = {
      ...p,
      questionCount: questionCounts.get(p.id) ?? 0,
      lessonCount: lessonCounts.get(p.id) ?? 0,
    };
    group.patterns.push(row);
  }

  const totalSkills = SAT_TAXONOMY.reduce((n, d) => n + d.skills.length, 0);
  const classified = (questionRows as unknown[]).length;

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <Link href="/admin/content">&larr; Question content</Link>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Content</div>
        <h1 className={a.h1}>Question patterns</h1>
        <p className={a.sub}>
          The sub-skill catalog: a recognizable question format within a skill, paired with the
          rehearsed procedure for it. Narrower than a curriculum unit, coarser than a single question
          &mdash; &ldquo;when you see this, run this.&rdquo;
        </p>
        <p className={a.sub}>
          <strong>{patterns.length.toLocaleString()}</strong> pattern
          {patterns.length === 1 ? '' : 's'} across <strong>{groups.size}</strong> of {totalSkills}{' '}
          skills · {classified.toLocaleString()} question{classified === 1 ? '' : 's'} classified ·{' '}
          <Link href="/admin/content/units" className={a.link}>
            &rarr; Unit coverage
          </Link>
        </p>
        <p className={a.help}>
          Patterns are student-readable reference data. A lesson tagged to a pattern is the most
          specific thing remediation can recommend, so keep names concrete and cues written the way a
          student would recognize the question &mdash; not as topic labels.
        </p>
      </header>

      <PatternImportPanel patterns={patterns as ExportablePattern[]} />

      <PatternCatalogManager
        groups={[...groups.values()]}
        initialSkill={initialSkill}
        initialDomain={initialDomain}
      />
    </main>
  );
}
