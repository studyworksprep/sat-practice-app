import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { Table, Th, Td } from '@/lib/ui/Table';
import a from '@/app/(admin)/admin.module.css';

export const dynamic = 'force-dynamic';

export default async function LessonReviewQueuePage({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') {
    if (['teacher', 'manager'].includes(profile.role)) redirect('/tutor/lessons');
    redirect('/dashboard');
  }

  const [{ data: submitted }, { data: recent }] = await Promise.all([
    supabase.from('lesson_revisions').select(`
      id, title, base_lesson_id, change_summary, submitted_at,
      owner:profiles!lesson_revisions_owner_id_fkey(first_name, last_name, email),
      base:lessons!lesson_revisions_base_lesson_id_fkey(title)
    `).eq('state', 'submitted').order('submitted_at'),
    supabase.from('lesson_revisions').select(`
      id, title, state, reviewed_at,
      owner:profiles!lesson_revisions_owner_id_fkey(first_name, last_name, email)
    `).in('state', ['approved', 'rejected', 'changes_requested'])
      .order('reviewed_at', { ascending: false }).limit(20),
  ]);

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}><Link href="/admin/lessons">← Lessons</Link></nav>
      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Lesson review</div>
        <h1 className={a.h1}>Tutor submissions</h1>
        <p className={a.sub}>Only submitted work appears here; private tutor drafts stay out of the canonical lesson list.</p>
      </header>
      {sp.changes_requested === '1' && <Flash>Changes requested.</Flash>}
      {sp.rejected === '1' && <Flash>Proposal rejected.</Flash>}

      <section className={a.section}>
        <h2 className={a.h2}>Awaiting review ({submitted?.length ?? 0})</h2>
        {!submitted?.length ? <p className={a.help}>Nothing is waiting for review.</p> : (
          <Table><thead><tr><Th>Proposal</Th><Th>Contributor</Th><Th>Source</Th><Th>Submitted</Th><Th /></tr></thead>
            <tbody>{submitted.map((row) => <tr key={row.id}>
              <Td><strong>{row.title}</strong>{row.change_summary && <div style={S.muted}>{row.change_summary}</div>}</Td>
              <Td>{personName(row.owner)}</Td>
              <Td>{row.base?.title ?? 'New lesson'}</Td>
              <Td>{formatDate(row.submitted_at)}</Td>
              <Td><Link className={a.link} href={`/admin/lessons/review/${row.id}`}>Review →</Link></Td>
            </tr>)}</tbody>
          </Table>
        )}
      </section>

      <section className={a.section}>
        <h2 className={a.h2}>Recent decisions</h2>
        {!recent?.length ? <p className={a.help}>No decisions yet.</p> : (
          <Table><thead><tr><Th>Proposal</Th><Th>Contributor</Th><Th>Decision</Th><Th>Date</Th><Th /></tr></thead>
            <tbody>{recent.map((row) => <tr key={row.id}>
              <Td>{row.title}</Td><Td>{personName(row.owner)}</Td><Td>{stateLabel(row.state)}</Td>
              <Td>{formatDate(row.reviewed_at)}</Td>
              <Td><Link className={a.link} href={`/admin/lessons/review/${row.id}`}>View →</Link></Td>
            </tr>)}</tbody>
          </Table>
        )}
      </section>
    </main>
  );
}

function Flash({ children }) { return <div style={S.flash}>{children}</div>; }
function personName(person) { return [person?.first_name, person?.last_name].filter(Boolean).join(' ') || person?.email || 'Tutor'; }
function formatDate(v) { return v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }
function stateLabel(v) { return ({ approved: 'Published', rejected: 'Rejected', changes_requested: 'Changes requested' })[v] ?? v; }
const S = {
  muted: { color: 'var(--fg3)', fontSize: 12, marginTop: 4, maxWidth: 520 },
  flash: { padding: '10px 14px', background: 'var(--color-success-bg)', color: 'var(--color-diff-easy-fg)', border: '1px solid var(--color-success)', borderRadius: 8 },
};
