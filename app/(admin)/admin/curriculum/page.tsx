// Admin · Curriculum — the syllabus home for a non-technical editor
// (docs/foundations-and-question-patterns.md §7.4). Every SAT unit in
// teaching order, grouped Math then Reading & Writing, with its
// syllabus outline, a status the editor can act on, and the one switch
// that makes plans use the syllabi. Everything about a unit's syllabus
// is edited on /admin/curriculum/<unit>; nothing here needs a
// spreadsheet or a code.
//
// Server Component: one read of units, steps (with lesson titles), and
// the flag; the switch is the only client island.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';
import { UNIT_SYLLABUS_FLAG } from '@/lib/plan/unit-steps';
import { Table, Th, Td } from '@/lib/ui/Table';
import { SyllabusFlagSwitch } from './SyllabusFlagSwitch';
import a from '../../admin.module.css';

export const dynamic = 'force-dynamic';

const DOMAIN_BY_CODE = new Map(SAT_TAXONOMY.map((d) => [d.code, d]));
const MATH_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

interface StepRow {
  unit_id: string;
  position: number;
  kind: string;
  role: string | null;
  lesson: { title: string; status: string } | Array<{ title: string; status: string }> | null;
}

interface UnitView {
  id: string;
  sequence: number;
  title: string;
  domainName: string;
  skillCode: string;
  section: 'Math' | 'Reading & Writing';
  authoredAt: string | null;
  outline: string[];
  lessonCount: number;
  status: 'ready' | 'default' | 'attention';
  statusNote: string;
}

export default async function AdminCurriculumPage() {
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const [{ data: unitRows }, { data: stepRows }, { data: flagRow }] = await Promise.all([
    supabase
      .from('curriculum_units')
      .select('id, domain_code, skill_code, title, sequence, syllabus_authored_at')
      .eq('test_type', 'sat')
      .order('sequence', { ascending: true }),
    supabase
      .from('curriculum_unit_steps')
      .select('unit_id, position, kind, role, lesson:lessons(title, status)')
      .order('position', { ascending: true }),
    supabase.from('feature_flags').select('value').eq('key', UNIT_SYLLABUS_FLAG).maybeSingle(),
  ]);

  const stepsByUnit = new Map<string, StepRow[]>();
  for (const r of (stepRows ?? []) as StepRow[]) {
    const list = stepsByUnit.get(r.unit_id) ?? [];
    list.push(r);
    stepsByUnit.set(r.unit_id, list);
  }

  const units: UnitView[] = (unitRows ?? []).map((u) => {
    const steps = stepsByUnit.get(u.id) ?? [];
    const lessonOf = (r: StepRow) => (Array.isArray(r.lesson) ? r.lesson[0] : r.lesson);
    const outline = steps.map((r) =>
      r.kind === 'lesson'
        ? `Lesson: ${lessonOf(r)?.title ?? 'missing lesson'}`
        : r.role === 'mixed'
          ? 'Mixed set'
          : 'Practice',
    );
    const lessonCount = steps.filter((r) => r.kind === 'lesson').length;
    const unpublished = steps.some((r) => r.kind === 'lesson' && lessonOf(r)?.status !== 'published');
    let status: UnitView['status'] = u.syllabus_authored_at ? 'ready' : 'default';
    let statusNote = u.syllabus_authored_at ? 'Authored' : 'Default — not yet authored';
    if (steps.length === 0) {
      status = 'attention';
      statusNote = 'No steps';
    } else if (lessonCount === 0) {
      status = 'attention';
      statusNote = 'No lesson — students only get a drill';
    } else if (unpublished) {
      status = 'attention';
      statusNote = 'Has an unpublished lesson';
    }
    return {
      id: u.id,
      sequence: u.sequence,
      title: u.title,
      domainName: DOMAIN_BY_CODE.get(u.domain_code)?.name ?? u.domain_code,
      skillCode: u.skill_code,
      section: MATH_DOMAINS.has(u.domain_code) ? 'Math' : 'Reading & Writing',
      authoredAt: u.syllabus_authored_at,
      outline,
      lessonCount,
      status,
      statusNote,
    };
  });

  const authored = units.filter((u) => u.authoredAt).length;
  const attention = units.filter((u) => u.status === 'attention').length;
  const flagOn = flagRow?.value === 'on';

  const sections: Array<{ name: UnitView['section']; units: UnitView[] }> = [
    { name: 'Math', units: units.filter((u) => u.section === 'Math') },
    { name: 'Reading & Writing', units: units.filter((u) => u.section === 'Reading & Writing') },
  ];

  return (
    <main className={a.container}>
      <header className={a.header}>
        <div className={a.eyebrow}>Admin</div>
        <h1 className={a.h1}>Curriculum</h1>
        <p className={a.sub}>
          Each unit is one SAT skill. Its syllabus is the order you would teach it in: a lesson, then
          practice on that lesson, the next lesson, its practice, and a mixed set to finish. Study
          plans walk these syllabi unit by unit.
        </p>
        <p className={a.sub}>
          <strong>{authored} of {units.length}</strong> units authored
          {attention > 0 ? <> · <strong>{attention}</strong> need attention</> : null} ·{' '}
          <Link href="/admin/lessons" className={a.link}>Lessons</Link> ·{' '}
          <Link href="/admin/techniques" className={a.link}>Techniques</Link> ·{' '}
          <Link href="/tutor/tagging" className={a.link}>Tag questions</Link> ·{' '}
          <Link href="/admin/content/units" className={a.link}>Coverage &amp; planning settings</Link>
        </p>
      </header>

      <SyllabusFlagSwitch on={flagOn} authored={authored} total={units.length} />

      <details className={a.section} style={S.help}>
        <summary style={S.helpSummary}>How to build a unit</summary>
        <ol style={S.helpList}>
          <li>Open a unit and add its first lesson. The lesson&rsquo;s own check questions are the worked examples, so there is no warm-up drill.</li>
          <li>Add a practice set right after it: the questions the student does on their own using what the lesson taught.</li>
          <li>Repeat for each technique in the unit, in the order you teach them.</li>
          <li>Finish with a mixed set: homework across everything in the unit so far.</li>
          <li>A lesson you use in several units is taught once. Later units skip it for students who already completed it.</li>
        </ol>
      </details>

      {sections.map((section) => (
        <section key={section.name} className={a.section}>
          <h2 className={a.h2}>{section.name}</h2>
          <Table style={{ fontSize: '0.86rem' }}>
            <thead>
              <tr>
                <Th style={{ width: '2.5rem' }}>#</Th>
                <Th>Unit</Th>
                <Th>Syllabus</Th>
                <Th style={{ whiteSpace: 'nowrap' }}>Status</Th>
                <Th style={{ width: '1%' }}></Th>
              </tr>
            </thead>
            <tbody>
              {section.units.map((u) => (
                <tr key={u.id}>
                  <Td style={{ color: 'var(--fg3, #6b7280)', verticalAlign: 'top' }}>{u.sequence}</Td>
                  <Td style={{ verticalAlign: 'top' }}>
                    <Link href={`/admin/curriculum/${u.id}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
                      {u.title}
                    </Link>
                    <div style={{ color: 'var(--fg3, #6b7280)', fontSize: '0.78rem' }}>{u.domainName}</div>
                  </Td>
                  <Td style={{ verticalAlign: 'top' }}>
                    {u.outline.length === 0 ? (
                      <span style={{ color: 'var(--fg3, #6b7280)' }}>Nothing yet</span>
                    ) : (
                      <ol style={S.outline}>
                        {u.outline.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ol>
                    )}
                  </Td>
                  <Td style={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    <span style={u.status === 'ready' ? S.ready : u.status === 'attention' ? S.attention : S.default}>
                      {u.statusNote}
                    </span>
                  </Td>
                  <Td style={{ verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Link href={`/admin/curriculum/${u.id}`} className={a.link}>
                      {u.authoredAt ? 'Edit' : 'Build'} &rarr;
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ))}
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  help: { padding: '0.75rem 1rem', border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb' },
  helpSummary: { cursor: 'pointer', fontWeight: 600 },
  helpList: { margin: '0.5rem 0 0', paddingLeft: '1.25rem', lineHeight: 1.6, fontSize: '0.9rem', maxWidth: '70ch' },
  outline: { margin: 0, paddingLeft: '1.2rem', lineHeight: 1.5 },
  ready: { padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: '#dcfce7', color: '#166534' },
  default: { padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: '#f3f4f6', color: '#374151' },
  attention: { padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: '#fef3c7', color: '#92400e' },
};
