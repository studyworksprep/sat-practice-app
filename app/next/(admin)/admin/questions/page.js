// Admin question-bank browser. Paginated table of questions_v2
// with lean display — display_code / domain / skill / difficulty /
// status flags / updated_at — and a per-row link to
// /tutor/review/<id> where <QuestionRenderer mode="teacher"> does
// the full typeset view. The list stays fast by keeping rendered
// columns out of the SELECT; clicking through loads them at the
// detail page.
//
// URL params (all optional):
//   ?q=<text>         — case-insensitive substring match on
//                       display_code OR stem_html
//   ?broken=1         — only rows with is_broken = true
//   ?trimmed=1        — only rows with "TRIMMED" in any field
//   ?hasmath=1        — only rows with <math> or <img role="math">
//   ?page=N           — 1-indexed; 50 rows per page

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { Table, Th, Td } from '@/lib/ui/Table';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function AdminQuestionsPage({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') redirect('/');

  const q        = typeof sp.q        === 'string' ? sp.q.trim()        : '';
  const broken   = sp.broken   === '1';
  const trimmed  = sp.trimmed  === '1';
  const hasmath  = sp.hasmath  === '1';
  const page     = Math.max(1, Number(sp.page) || 1);
  const offset   = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('questions_v2')
    .select(
      'id, display_code, question_type, domain_name, skill_name, difficulty, is_broken, stem_html, updated_at',
      { count: 'exact' },
    )
    .is('deleted_at', null);

  if (broken)  query = query.eq('is_broken', true);
  if (trimmed) query = query.or('stem_html.ilike.%TRIMMED%,stimulus_html.ilike.%TRIMMED%,rationale_html.ilike.%TRIMMED%');
  if (hasmath) query = query.or('stem_html.ilike.%<math%,stem_html.ilike.%role="math"%,stimulus_html.ilike.%<math%,stimulus_html.ilike.%role="math"%');
  if (q) {
    // display_code prefix OR stem text contains. ilike handles both
    // cases; PostgREST "or" uses commas.
    query = query.or(`display_code.ilike.%${q}%,stem_html.ilike.%${q}%`);
  }

  const { data: rows, count, error } = await query
    .order('display_code', { ascending: true, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    return (
      <main style={S.main}>
        <h1 style={S.h1}>Questions</h1>
        <p style={S.err}>Query failed: {error.message}</p>
      </main>
    );
  }

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main style={S.main}>
      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/admin" style={S.backLink}>← Admin</Link>
      </nav>

      <header style={S.header}>
        <h1 style={S.h1}>Questions</h1>
        <div style={S.sub}>
          {total.toLocaleString()} match{total === 1 ? '' : 'es'} · page {page} of {lastPage}
        </div>
      </header>

      <FilterBar current={{ q, broken, trimmed, hasmath }} />

      {(rows ?? []).length === 0 ? (
        <p style={S.empty}>No questions match the current filters.</p>
      ) : (
        <Table style={{ fontSize: '0.9rem' }}>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Type</Th>
              <Th>Domain</Th>
              <Th>Skill</Th>
              <Th style={{ textAlign: 'center' }}>Diff</Th>
              <Th>Flags</Th>
              <Th>Stem preview</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  <Link href={`/tutor/review/${r.id}`} style={S.link}>
                    {r.display_code || r.id.slice(0, 8)}
                  </Link>
                </Td>
                <Td style={{ textTransform: 'uppercase', fontSize: '0.75rem', color: '#6b7280' }}>
                  {r.question_type}
                </Td>
                <Td>{r.domain_name ?? '—'}</Td>
                <Td>{r.skill_name ?? '—'}</Td>
                <Td style={{ textAlign: 'center' }}>{r.difficulty ?? '—'}</Td>
                <Td>
                  <FlagPills row={r} />
                </Td>
                <Td style={{ maxWidth: 380, color: '#374151' }}>
                  <span style={S.snippet}>{stripToSnippet(r.stem_html)}</span>
                </Td>
                <Td style={{ color: '#6b7280', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {formatDate(r.updated_at) || '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Pagination current={page} last={lastPage} params={{ q, broken, trimmed, hasmath }} />
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function FilterBar({ current }) {
  // Plain form with GET submit — URL params carry state so each
  // filter change is bookmarkable + shareable. Keeps this a Server
  // Component; no client JS needed.
  return (
    <form action="/admin/questions" method="get" style={S.filterBar}>
      <input
        type="text"
        name="q"
        defaultValue={current.q}
        placeholder="Search display code or stem text…"
        style={S.search}
      />
      <label style={S.toggle}>
        <input type="checkbox" name="broken"  value="1" defaultChecked={current.broken} />
        Broken
      </label>
      <label style={S.toggle}>
        <input type="checkbox" name="trimmed" value="1" defaultChecked={current.trimmed} />
        Trimmed
      </label>
      <label style={S.toggle}>
        <input type="checkbox" name="hasmath" value="1" defaultChecked={current.hasmath} />
        Has math
      </label>
      <button type="submit" style={S.submit}>Apply</button>
      <Link href="/admin/questions" style={S.clearLink}>Clear</Link>
    </form>
  );
}

function FlagPills({ row }) {
  const flags = [];
  if (row.is_broken) flags.push(['broken', '#fee2e2', '#991b1b']);
  if ((row.stem_html ?? '').includes('TRIMMED')) {
    flags.push(['trimmed', '#fef3c7', '#92400e']);
  }
  if (/role="math"/.test(row.stem_html ?? '')) {
    flags.push(['png-math', '#e0e7ff', '#3730a3']);
  }
  if (flags.length === 0) return <span style={{ color: '#d1d5db' }}>—</span>;
  return (
    <span style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
      {flags.map(([label, bg, fg]) => (
        <span
          key={label}
          style={{
            display: 'inline-block', padding: '0.1rem 0.4rem',
            borderRadius: 999, fontSize: '0.65rem', fontWeight: 600,
            background: bg, color: fg,
          }}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

function Pagination({ current, last, params }) {
  if (last <= 1) return null;
  const prev = current > 1 ? toUrl({ ...params, page: current - 1 }) : null;
  const next = current < last ? toUrl({ ...params, page: current + 1 }) : null;
  return (
    <div style={S.pagination}>
      {prev ? <Link href={prev} style={S.pagBtn}>← Prev</Link> : <span style={S.pagBtnDisabled}>← Prev</span>}
      <span style={S.pagCurrent}>Page {current} / {last}</span>
      {next ? <Link href={next} style={S.pagBtn}>Next →</Link> : <span style={S.pagBtnDisabled}>Next →</span>}
    </div>
  );
}

function toUrl({ q, broken, trimmed, hasmath, page }) {
  const params = new URLSearchParams();
  if (q)       params.set('q',       q);
  if (broken)  params.set('broken',  '1');
  if (trimmed) params.set('trimmed', '1');
  if (hasmath) params.set('hasmath', '1');
  if (page && page !== 1) params.set('page', String(page));
  const qs = params.toString();
  return `/admin/questions${qs ? `?${qs}` : ''}`;
}

// ──────────────────────────────────────────────────────────────
// Strip HTML and base64-URI noise from stem, return first 120
// chars for the compact row preview.
// ──────────────────────────────────────────────────────────────

function stripToSnippet(html, limit = 120) {
  if (!html) return '—';
  const plain = html
    .replace(/<img[^>]*src="data:[^"]*"[^>]*>/g, '[img]')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&mdash;|&ndash;/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= limit) return plain;
  return plain.slice(0, limit).trimEnd() + '…';
}

// ──────────────────────────────────────────────────────────────

const S = {
  main: { maxWidth: 1400, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  backLink: { color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' },
  header: { marginBottom: '1rem' },
  h1: { fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  sub: { color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' },
  filterBar: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' },
  search: {
    padding: '0.375rem 0.625rem', border: '1px solid #d1d5db', borderRadius: 6,
    fontSize: '0.9rem', minWidth: 280,
  },
  toggle: { display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', color: '#374151' },
  submit: {
    padding: '0.375rem 0.875rem', background: '#2563eb', color: 'white',
    border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem',
  },
  clearLink: { color: '#6b7280', textDecoration: 'none', fontSize: '0.85rem' },
  snippet: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  link: { color: '#2563eb', textDecoration: 'none', fontWeight: 600 },
  empty: { color: '#6b7280', textAlign: 'center', padding: '3rem' },
  err: { color: '#991b1b' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem' },
  pagBtn: {
    padding: '0.375rem 0.75rem', background: 'white', color: '#374151',
    border: '1px solid #d1d5db', borderRadius: 6, textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500,
  },
  pagBtnDisabled: {
    padding: '0.375rem 0.75rem', background: '#f9fafb', color: '#d1d5db',
    border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.85rem', fontWeight: 500, cursor: 'not-allowed',
  },
  pagCurrent: { color: '#374151', fontSize: '0.85rem', fontWeight: 500 },
};
