// Admin drafts list — every open question_content_drafts row,
// linking to its side-by-side editor. Status defaults to
// 'pending'; the list excludes 'promoted' so once a draft has
// shipped it falls off the board.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { Table, Th, Td } from '@/lib/ui/Table';

export const dynamic = 'force-dynamic';

export default async function DraftsListPage() {
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') redirect('/');

  const { data: drafts } = await supabase
    .from('question_content_drafts')
    .select(`
      id, question_id, status, notes, created_at, updated_at,
      stem_html, stimulus_html, rationale_html, options,
      question:questions_v2(display_code, question_type)
    `)
    .neq('status', 'promoted')
    .order('updated_at', { ascending: false })
    .limit(200);

  const rows = (drafts ?? []).map((d) => ({
    id: d.id,
    question_id: d.question_id,
    status: d.status,
    notes: d.notes,
    updated_at: d.updated_at,
    display_code: d.question?.display_code ?? null,
    question_type: d.question?.question_type ?? null,
    // "Touches" — which of the four fields the draft proposes to
    // change. NULL means "leave as-is"; non-null means "replace".
    touches: [
      d.stem_html      != null && 'stem',
      d.stimulus_html  != null && 'stimulus',
      d.rationale_html != null && 'rationale',
      d.options        != null && 'options',
    ].filter(Boolean).join(', ') || '—',
  }));

  return (
    <main style={S.main}>
      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/admin/content" style={S.backLink}>← Admin content</Link>
      </nav>

      <header style={S.header}>
        <h1 style={S.h1}>Content drafts</h1>
        <div style={S.sub}>
          Staged content fixes for questions_v2 rows. Promoted drafts drop off this list.
        </div>
      </header>

      {rows.length === 0 ? (
        <p style={S.empty}>No open drafts.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Question</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Touches</Th>
              <Th>Notes</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link href={`/admin/content/drafts/${r.id}`}>
                    {r.display_code || r.question_id.slice(0, 8)}
                  </Link>
                </Td>
                <Td>{r.question_type ?? ''}</Td>
                <Td><StatusPill status={r.status} /></Td>
                <Td>{r.touches}</Td>
                <Td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.notes?.slice(0, 80) ?? ''}
                </Td>
                <Td>{formatDate(r.updated_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </main>
  );
}

function StatusPill({ status }) {
  const colors = {
    pending:  { bg: '#fef3c7', fg: '#92400e' },
    review:   { bg: '#dbeafe', fg: '#1e40af' },
    approved: { bg: '#dcfce7', fg: '#166534' },
    rejected: { bg: '#fee2e2', fg: '#991b1b' },
    promoted: { bg: '#f3f4f6', fg: '#374151' },
  }[status] ?? { bg: '#f3f4f6', fg: '#374151' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.125rem 0.5rem',
      borderRadius: 999,
      fontSize: '0.75rem',
      fontWeight: 600,
      background: colors.bg,
      color: colors.fg,
    }}>
      {status}
    </span>
  );
}

const S = {
  main: { maxWidth: 1100, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  backLink: { color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' },
  header: { marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e5e7eb' },
  h1: { fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  sub: { color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' },
  empty: { color: '#6b7280', padding: '2rem', textAlign: 'center' },
};
