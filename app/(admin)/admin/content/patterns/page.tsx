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
import { Table, Th, Td } from '@/lib/ui/Table';
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

  const [patternRows, questionRows, topicRows, { data: recentTagRows }] = await Promise.all([
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
    // Audit trail for the tutor-facing picker: opportunistic tagging
    // spreads across many hands, so admins need a spot-check queue.
    // Two queries rather than a PostgREST embed — questions_v2 has
    // several relationships into profiles and its views, and naming
    // the constraint to disambiguate is more fragile than a join here.
    supabase
      .from('questions_v2')
      .select('id, display_code, pattern_id, pattern_tagged_by, pattern_tagged_at')
      .not('pattern_tagged_at', 'is', null)
      .is('deleted_at', null)
      .order('pattern_tagged_at', { ascending: false })
      .limit(12),
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

  // Resolve tagger names for the audit strip.
  const recentTags = (recentTagRows ?? []) as Array<{
    id: string;
    display_code: string | null;
    pattern_id: string | null;
    pattern_tagged_by: string | null;
    pattern_tagged_at: string | null;
  }>;
  const taggerIds = [...new Set(recentTags.map((r) => r.pattern_tagged_by).filter(Boolean))] as string[];
  const { data: taggerRows } = taggerIds.length
    ? await supabase
        .from('profiles')
        .select('id, first_name, last_name, tutor_name')
        .in('id', taggerIds)
    : { data: [] };
  const taggerNames = new Map(
    ((taggerRows ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      tutor_name: string | null;
    }>).map((p) => [
      p.id,
      (p.tutor_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || '').trim(),
    ]),
  );
  const patternNames = new Map(patterns.map((p) => [p.id, p.name]));

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

      {recentTags.length > 0 && (
        <section className={a.section}>
          <h2 className={a.h2}>Recently tagged</h2>
          <p className={a.sub} style={{ marginBottom: '0.75rem' }}>
            Classifications applied from the review surfaces, newest first. Spot-check these &mdash; a
            tag applied from a stale recognition cue is the failure mode worth catching early.
          </p>
          <Table style={{ fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <Th>Question</Th>
                <Th>Pattern</Th>
                <Th>Tagged by</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {recentTags.map((row) => (
                <tr key={row.id}>
                  <Td style={{ fontFamily: 'monospace' }}>
                    <Link href={`/admin/questions/${row.id}`} className={a.link}>
                      {row.display_code ?? row.id.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>
                    {row.pattern_id
                      ? (patternNames.get(row.pattern_id) ?? 'Unknown pattern')
                      : <span style={{ color: 'var(--fg3, #6b7280)' }}>cleared</span>}
                  </Td>
                  <Td>
                    {(row.pattern_tagged_by && taggerNames.get(row.pattern_tagged_by)) || '—'}
                  </Td>
                  {/* ISO slice, not toLocaleString: locale output can
                      differ between the SSR pass and hydration. */}
                  <Td style={{ color: 'var(--fg3, #6b7280)' }}>
                    {row.pattern_tagged_at?.slice(0, 16).replace('T', ' ') ?? '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}

      <PatternCatalogManager
        groups={[...groups.values()]}
        initialSkill={initialSkill}
        initialDomain={initialDomain}
      />
    </main>
  );
}
