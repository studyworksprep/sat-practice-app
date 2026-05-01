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
import a from '../../admin.module.css';

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
      <main className={a.container}>
        <header className={a.header}>
          <div className={a.eyebrow}>Admin · Questions</div>
          <h1 className={a.h1}>Questions</h1>
        </header>
        <p style={S.err}>Query failed: {error.message}</p>
      </main>
    );
  }

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <Link href="/admin">← Admin</Link>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Questions</div>
        <h1 className={a.h1}>Questions</h1>
        <p className={a.sub}>
          {total.toLocaleString()} match{total === 1 ? '' : 'es'} · page {page} of {lastPage}
        </p>
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
  if (row.is_broken) {
    flags.push(['broken', 'var(--color-danger-bg)', 'var(--color-diff-hard-fg)', 'var(--color-danger)']);
  }
  if ((row.stem_html ?? '').includes('TRIMMED')) {
    flags.push(['trimmed', 'var(--color-diff-med-bg)', 'var(--color-diff-med-fg)', 'var(--color-diff-med-bd)']);
  }
  if (/role="math"/.test(row.stem_html ?? '')) {
    flags.push(['png-math', 'var(--color-app-accent-soft)', 'var(--color-app-accent)', 'var(--color-app-accent)']);
  }
  if (flags.length === 0) return <span style={{ color: 'var(--fg3)' }}>—</span>;
  return (
    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {flags.map(([label, bg, fg, bd]) => (
        <span
          key={label}
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 'var(--radius-pill)',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            background: bg,
            color: fg,
            border: `1px solid ${bd}`,
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

// Page chrome (container/breadcrumb/header) comes from
// admin.module.css; the inline objects below cover the per-page
// internals — filter bar, snippet column, pagination.
const S = {
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 'var(--s3)',
    flexWrap: 'wrap',
  },
  search: {
    padding: '8px 10px',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-md)',
    fontSize: 13,
    fontFamily: 'inherit',
    color: 'var(--fg1)',
    background: 'var(--bg-white)',
    minWidth: 280,
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    color: 'var(--fg1)',
    fontWeight: 600,
  },
  submit: {
    padding: '8px 16px',
    background: 'var(--color-app-accent)',
    color: 'var(--bg-white)',
    border: '1px solid var(--color-app-accent)',
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'inherit',
  },
  clearLink: {
    color: 'var(--fg3)',
    textDecoration: 'none',
    fontSize: 12,
    fontWeight: 600,
  },
  snippet: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--fg2)',
  },
  link: {
    color: 'var(--color-app-accent)',
    textDecoration: 'none',
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
  },
  empty: {
    color: 'var(--fg3)',
    textAlign: 'center',
    padding: 'var(--s6)',
  },
  err: { color: 'var(--color-danger)' },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 'var(--s4)',
  },
  pagBtn: {
    padding: '6px 12px',
    background: 'var(--bg-white)',
    color: 'var(--fg1)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-md)',
    textDecoration: 'none',
    fontSize: 12,
    fontWeight: 600,
  },
  pagBtnDisabled: {
    padding: '6px 12px',
    background: 'var(--color-slate-50)',
    color: 'var(--fg3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'not-allowed',
  },
  pagCurrent: {
    color: 'var(--fg2)',
    fontSize: 12,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
};
