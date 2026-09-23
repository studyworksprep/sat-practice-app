// Tutor · Tag questions — every SAT unit with its technique-tagging
// progress (docs/foundations-and-question-patterns.md §8.5 step B).
// Manager + admin. The place a co-instructor picks a unit to tag;
// admins also arrive here from the Curriculum pages.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { loadTechniqueCatalog } from '@/lib/practice/load-question-techniques';
import { Table, Th, Td } from '@/lib/ui/Table';
import { Button } from '@/lib/ui/Button';
import s from './Tagging.module.css';

export const dynamic = 'force-dynamic';

const MATH_DOMAINS = new Set(['H', 'P', 'Q', 'S']);
const DOMAIN_BY_CODE = new Map(SAT_TAXONOMY.map((d) => [d.code, d]));

interface UnitView {
  id: string;
  sequence: number;
  title: string;
  domainName: string;
  section: 'Math' | 'Reading & Writing';
  total: number;
  tagged: number;
  defaults: string[];
}

interface TagRow {
  question_id: string;
  question:
    | { skill_code: string | null; is_published: boolean; is_broken: boolean; deleted_at: string | null; pool: string }
    | Array<{ skill_code: string | null; is_published: boolean; is_broken: boolean; deleted_at: string | null; pool: string }>
    | null;
}

export default async function TaggingIndexPage() {
  const { profile, supabase } = await requireUser();
  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (profile.role === 'teacher') redirect('/tutor/dashboard');
  if (!['manager', 'admin'].includes(profile.role)) redirect('/');

  const [{ data: unitRows }, questionRows, tagRows, techniques] = await Promise.all([
    supabase
      .from('curriculum_units')
      .select('id, domain_code, skill_code, title, sequence')
      .eq('test_type', 'sat')
      .order('sequence', { ascending: true }),
    fetchAll(async (from, to) =>
      supabase
        .from('questions_v2')
        .select('skill_code')
        .eq('is_published', true)
        .eq('is_broken', false)
        .is('deleted_at', null)
        .eq('pool', 'standard')
        .range(from, to),
    ),
    fetchAll(async (from, to) =>
      supabase
        .from('question_techniques')
        .select('question_id, question:questions_v2!inner(skill_code, is_published, is_broken, deleted_at, pool)')
        .range(from, to),
    ),
    loadTechniqueCatalog({ role: profile.role }),
  ]);

  const totals = new Map<string, number>();
  for (const q of questionRows as Array<{ skill_code: string | null }>) {
    if (q.skill_code) totals.set(q.skill_code, (totals.get(q.skill_code) ?? 0) + 1);
  }
  // Distinct tagged questions per skill, counting only what the unit
  // page itself lists (published, unbroken, standard pool).
  const taggedBySkill = new Map<string, Set<string>>();
  for (const r of tagRows as unknown as TagRow[]) {
    const q = Array.isArray(r.question) ? r.question[0] : r.question;
    if (!q?.skill_code || !q.is_published || q.is_broken || q.deleted_at || q.pool !== 'standard') continue;
    (taggedBySkill.get(q.skill_code) ?? taggedBySkill.set(q.skill_code, new Set()).get(q.skill_code)!).add(r.question_id);
  }
  const defaultsBySkill = new Map<string, string[]>();
  for (const t of techniques ?? []) {
    for (const code of t.skillCodes) {
      (defaultsBySkill.get(code) ?? defaultsBySkill.set(code, []).get(code)!).push(t.name);
    }
  }

  const units: UnitView[] = (unitRows ?? []).map((u) => ({
    id: u.id,
    sequence: u.sequence,
    title: u.title,
    domainName: DOMAIN_BY_CODE.get(u.domain_code)?.name ?? u.domain_code,
    section: MATH_DOMAINS.has(u.domain_code) ? 'Math' : 'Reading & Writing',
    total: totals.get(u.skill_code) ?? 0,
    tagged: taggedBySkill.get(u.skill_code)?.size ?? 0,
    defaults: defaultsBySkill.get(u.skill_code) ?? [],
  }));
  const grandTotal = units.reduce((n, u) => n + u.total, 0);
  const grandTagged = units.reduce((n, u) => n + u.tagged, 0);
  const sections: Array<{ name: UnitView['section']; units: UnitView[] }> = [
    { name: 'Math', units: units.filter((u) => u.section === 'Math') },
    { name: 'Reading & Writing', units: units.filter((u) => u.section === 'Reading & Writing') },
  ];

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div>
          <div className={s.eyebrow}>{profile.role === 'admin' ? 'Admin' : 'Team'} · Tag questions</div>
          <h1 className={s.h1}>Tag questions by technique</h1>
          <p className={s.sub}>
            Pick a unit and, question by question, tick the technique(s) you would use to solve it. The
            practice set after a lesson draws the questions tagged with that lesson&rsquo;s techniques first.
            A technique that applies to a whole skill is set on the technique itself and needs no tagging here.
          </p>
          <p className={s.sub}>
            <strong>{grandTagged.toLocaleString()}</strong> of {grandTotal.toLocaleString()} questions tagged ·{' '}
            {(techniques ?? []).length} technique{(techniques ?? []).length === 1 ? '' : 's'} in the catalog
            {profile.role === 'admin' ? (
              <>
                {' '}· <Link href="/admin/techniques">Techniques</Link> · <Link href="/admin/curriculum">Curriculum</Link>
              </>
            ) : null}
          </p>
        </div>
      </header>

      {(techniques ?? []).length === 0 && (
        <p className={s.help}>
          There are no techniques yet, so there is nothing to tag.
          {profile.role === 'admin' ? <> Add them on the <Link href="/admin/techniques">Techniques</Link> page first.</> : ' Ask an admin to add them first.'}
        </p>
      )}

      {sections.map((section) => (
        <section key={section.name} className={s.section}>
          <h2>{section.name}</h2>
          <Table style={{ fontSize: '0.88rem' }}>
            <thead>
              <tr>
                <Th style={{ width: '2.5rem' }}>#</Th>
                <Th>Unit</Th>
                <Th>Applies to every question here</Th>
                <Th className={s.progressCell}>Tagged</Th>
                <Th style={{ width: '1%' }}></Th>
              </tr>
            </thead>
            <tbody>
              {section.units.map((u) => {
                const pct = u.total ? Math.round((u.tagged / u.total) * 100) : 0;
                return (
                  <tr key={u.id}>
                    <Td className={s.muted} style={{ verticalAlign: 'top' }}>{u.sequence}</Td>
                    <Td style={{ verticalAlign: 'top' }}>
                      <div className={s.unitCell}>
                        <Link href={`/tutor/tagging/${u.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{u.title}</Link>
                      </div>
                      <div className={s.unitMeta}>{u.domainName}</div>
                    </Td>
                    <Td style={{ verticalAlign: 'top' }}>
                      {u.defaults.length > 0 ? u.defaults.join(', ') : <span className={s.muted}>—</span>}
                    </Td>
                    <Td className={s.progressCell} style={{ verticalAlign: 'top' }}>
                      <div className={s.progressText}>
                        {u.tagged} of {u.total}
                        {u.total > 0 && u.tagged === u.total ? <> <span className={s.done}>all tagged</span></> : null}
                      </div>
                      <div className={s.bar}>
                        <div className={s.fill} style={{ width: `${pct}%` }} />
                      </div>
                    </Td>
                    <Td style={{ verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Button size="sm" variant={u.tagged < u.total ? 'primary' : 'secondary'} href={`/tutor/tagging/${u.id}`}>
                        {u.tagged === 0 ? 'Start' : u.tagged < u.total ? 'Continue' : 'Review'} &rarr;
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </section>
      ))}
    </main>
  );
}
