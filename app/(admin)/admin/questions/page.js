// Admin question-bank browser. Paginated table of questions_v2
// with lean display — display_code / domain / skill / difficulty /
// status flags / updated_at — and a per-row link to
// /admin/questions/<id> where <QuestionRenderer mode="teacher"> does
// the full typeset view. The detail page lives in the (admin) tree
// (parallel to the tutor /tutor/review/<id> page, sharing the same
// QuestionReviewPage component) so the admin nav stays visible
// during the drill-in. The list stays fast by keeping rendered
// columns out of the SELECT; clicking through loads them at the
// detail page.
//
// URL params (all optional):
//   ?q=<text>         — case-insensitive substring match on
//                       display_code OR stem_html
//   ?broken=1         — only rows with is_broken = true
//   ?trimmed=1        — only rows with "TRIMMED" in any field
//   ?hasmath=1        — only rows with <math> or <img role="math">
//   ?tag=<id>         — only rows linked to this concept tag
//                       (repeatable; several tags AND-combine)
//   ?page=N           — 1-indexed; 50 rows per page

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { fetchAll } from '@/lib/api/paginate';
import { intersectTaggedQuestionIds, normalizeTagIds } from '@/lib/practice/tag-question-ids';
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
  // Set by the Techniques catalog's per-technique tag count
  // (/admin/techniques). Not a FilterBar control — it is a drill-in
  // from elsewhere, so it shows as a dismissible chip.
  const technique = typeof sp.technique === 'string' ? sp.technique.trim() : '';
  const page     = Math.max(1, Number(sp.page) || 1);
  const offset   = (page - 1) * PAGE_SIZE;

  // Concept-tag filter. Multiple ?tag= values AND-combine, matching
  // the quick-find search and the lesson-pack builder. Unknown ids
  // (a stale bookmark after a tag merge/delete) are dropped rather
  // than left as an invisible constraint that matches nothing.
  const tagCatalog = await loadTagCatalog(supabase);
  const tagById = new Map(tagCatalog.map((t) => [t.id, t]));
  const tagIds = normalizeTagIds(Array.isArray(sp.tag) ? sp.tag : [sp.tag])
    .filter((id) => tagById.has(id));
  const activeTags = tagIds.map((id) => tagById.get(id));

  // Resolve tags → question ids before the main query so the filter
  // is a single .in('id', …). An empty intersection means nothing
  // can match; skip the query rather than send an empty IN list.
  let tagFilteredIds = null;
  let tagResolveFailed = false;
  if (tagIds.length > 0) {
    const intersection = await intersectTaggedQuestionIds(supabase, tagIds);
    if (intersection == null) tagResolveFailed = true;
    else tagFilteredIds = Array.from(intersection);
  }

  // A technique drill-in joins question_techniques (!inner keeps only
  // tagged rows) rather than resolving ids first: a well-used technique
  // can carry thousands of tags, more than an `in` URL should hold.
  let query = supabase
    .from('questions_v2')
    .select(
      'id, display_code, question_type, domain_name, skill_name, difficulty, is_broken, stem_html, updated_at' +
        (technique ? ', question_techniques!inner(technique_id)' : ''),
      { count: 'exact' },
    )
    .is('deleted_at', null);

  if (technique) query = query.eq('question_techniques.technique_id', technique);
  if (tagFilteredIds) query = query.in('id', tagFilteredIds);
  if (broken)  query = query.eq('is_broken', true);
  if (trimmed) query = query.or('stem_html.ilike.%TRIMMED%,stimulus_html.ilike.%TRIMMED%,rationale_html.ilike.%TRIMMED%');
  if (hasmath) query = query.or('stem_html.ilike.%<math%,stem_html.ilike.%role="math"%,stimulus_html.ilike.%<math%,stimulus_html.ilike.%role="math"%');
  if (q) {
    // display_code prefix OR stem text contains. ilike handles both
    // cases; PostgREST "or" uses commas.
    query = query.or(`display_code.ilike.%${q}%,stem_html.ilike.%${q}%`);
  }

  const noTagMatches = tagFilteredIds != null && tagFilteredIds.length === 0;

  const [{ data: rows, count, error }, { data: techniqueRow }] = await Promise.all([
    noTagMatches || tagResolveFailed
      ? Promise.resolve(
          tagResolveFailed
            ? { data: null, count: null, error: { message: 'could not resolve the tag filter' } }
            : { data: [], count: 0, error: null },
        )
      : query
          .order('display_code', { ascending: true, nullsFirst: false })
          .range(offset, offset + PAGE_SIZE - 1),
    technique
      ? supabase.from('techniques').select('name').eq('id', technique).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

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

  // Tag names for the rows on this page. One small query keyed on
  // the 50 visible ids — cheap, and it makes the tag filter legible
  // (you can see why a row matched, and which tags to narrow by next).
  const tagNamesByQuestion = await loadRowTags(
    supabase,
    (rows ?? []).map((r) => r.id),
    tagById,
  );

  const filterParams = { q, broken, trimmed, hasmath, technique, tags: tagIds };

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <Link href="/admin">← Admin</Link>
      </nav>

      <header className={a.header}>
        <div style={S.headerRow}>
          <div>
            <div className={a.eyebrow}>Admin · Questions</div>
            <h1 className={a.h1}>Questions</h1>
            <p className={a.sub}>
              {total.toLocaleString()} match{total === 1 ? '' : 'es'} · page {page} of {lastPage}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/admin/questions/import" style={S.newBtn}>Import questions</Link>
            <Link href="/admin/questions/new" style={S.newBtn}>+ New question</Link>
          </div>
        </div>
      </header>

      {technique && (
        <p style={S.techniqueChip}>
          Showing questions tagged with the technique{' '}
          <strong>{techniqueRow ? `“${techniqueRow.name}”` : 'selected'}</strong>
          {' · '}
          <Link href={toUrl({ q, broken, trimmed, hasmath, tags: tagIds })} style={S.clearLink}>clear</Link>
          {' · '}
          <Link href="/admin/techniques" style={S.clearLink}>techniques →</Link>
        </p>
      )}

      <FilterBar
        current={{ q, broken, trimmed, hasmath, technique, tags: tagIds }}
        activeTags={activeTags}
        tagCatalog={tagCatalog}
      />

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
              <Th>Tags</Th>
              <Th>Stem preview</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  <Link href={`/admin/questions/${r.id}`} style={S.link}>
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
                <Td style={{ maxWidth: 220 }}>
                  <TagPills
                    names={tagNamesByQuestion.get(r.id) ?? []}
                    params={filterParams}
                  />
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

      <Pagination current={page} last={lastPage} params={filterParams} />
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function FilterBar({ current, activeTags, tagCatalog }) {
  // Plain form with GET submit — URL params carry state so each
  // filter change is bookmarkable + shareable. Keeps this a Server
  // Component; no client JS needed.
  //
  // Tags: the active ones render as chips (each with a remove link)
  // and ride along as hidden inputs so re-applying the text filter
  // keeps them. The "+ tag" select adds one more per submit; the
  // already-active tags are left out of its options.
  const activeIds = new Set(activeTags.map((t) => t.id));
  const addable = tagCatalog.filter((t) => !activeIds.has(t.id));
  return (
    <form action="/admin/questions" method="get" style={S.filterBar}>
      {/* Carried through so applying a text filter narrows within the
          technique drill-in rather than silently dropping it. */}
      {current.technique && <input type="hidden" name="technique" value={current.technique} />}
      {activeTags.map((t) => (
        <input key={t.id} type="hidden" name="tag" value={t.id} />
      ))}
      <input
        type="text"
        name="q"
        defaultValue={current.q}
        placeholder="Search display code or stem text…"
        style={S.search}
      />
      {activeTags.length > 0 && (
        <span style={S.tagChips}>
          {activeTags.map((t) => (
            <span key={t.id} style={S.tagChip}>
              {t.name}
              <Link
                href={toUrl({ ...current, tags: current.tags.filter((id) => id !== t.id) })}
                aria-label={`Remove tag filter ${t.name}`}
                title="Remove this tag filter"
                style={S.tagChipRemove}
              >
                ×
              </Link>
            </span>
          ))}
        </span>
      )}
      {addable.length > 0 && (
        <select
          name="tag"
          defaultValue=""
          aria-label="Add a concept-tag filter"
          style={S.tagSelect}
        >
          <option value="">{activeTags.length > 0 ? '+ another tag…' : 'Filter by tag…'}</option>
          {addable.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}
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

// Per-row tag chips. Each chip links to the current filters plus
// that tag, so narrowing from a row is one click. Tags already in
// the filter render flat (no link) — clicking them would be a no-op.
function TagPills({ names, params }) {
  if (names.length === 0) return <span style={{ color: 'var(--fg3)' }}>—</span>;
  const active = new Set(params.tags);
  return (
    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {names.map(({ id, name }) =>
        active.has(id) ? (
          <span key={id} style={{ ...S.rowTag, ...S.rowTagActive }}>{name}</span>
        ) : (
          <Link
            key={id}
            href={toUrl({ ...params, tags: [...params.tags, id] })}
            title={`Filter by tag “${name}”`}
            style={S.rowTag}
          >
            {name}
          </Link>
        ),
      )}
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

function toUrl({ q, broken, trimmed, hasmath, technique, tags, page }) {
  const params = new URLSearchParams();
  if (q)       params.set('q',       q);
  if (broken)  params.set('broken',  '1');
  if (trimmed) params.set('trimmed', '1');
  if (hasmath) params.set('hasmath', '1');
  if (technique) params.set('technique', technique);
  for (const id of tags ?? []) params.append('tag', id);
  if (page && page !== 1) params.set('page', String(page));
  const qs = params.toString();
  return `/admin/questions${qs ? `?${qs}` : ''}`;
}

// ──────────────────────────────────────────────────────────────
// Concept-tag lookups.
//
// The catalog is small (hundreds of rows) and is what the filter
// select renders, so it's read whole. Read failures degrade to an
// empty catalog — the page still renders, just without the tag
// controls — rather than failing the whole list.
// ──────────────────────────────────────────────────────────────

async function loadTagCatalog(supabase) {
  try {
    return await fetchAll(
      () => supabase.from('concept_tags').select('id, name'),
      { order: [{ column: 'name' }, { column: 'id' }] },
    );
  } catch {
    return [];
  }
}

// tag names per visible question, sorted by name. Only the ids on
// the current page are queried; the result is keyed by question id.
async function loadRowTags(supabase, questionIds, tagById) {
  const out = new Map();
  if (questionIds.length === 0 || tagById.size === 0) return out;
  const { data } = await supabase
    .from('question_concept_tags')
    .select('question_id, tag_id')
    .in('question_id', questionIds);
  for (const link of data ?? []) {
    const tag = tagById.get(link.tag_id);
    if (!tag) continue;
    let list = out.get(link.question_id);
    if (!list) {
      list = [];
      out.set(link.question_id, list);
    }
    list.push(tag);
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
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
  techniqueChip: {
    margin: '0 0 0.75rem',
    padding: '0.5rem 0.75rem',
    background: '#eef2ff',
    border: '1px solid #c7d2fe',
    borderRadius: 8,
    fontSize: '0.85rem',
    color: '#3730a3',
  },
  clearLink: {
    color: '#3730a3',
    textDecoration: 'underline',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  newBtn: {
    flexShrink: 0,
    padding: '0.55rem 1rem',
    background: '#16a34a',
    color: '#fff',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: '0.9rem',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
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
  tagSelect: {
    padding: '8px 10px',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-md)',
    fontSize: 13,
    fontFamily: 'inherit',
    color: 'var(--fg1)',
    background: 'var(--bg-white)',
    maxWidth: 240,
  },
  tagChips: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  tagChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 6px 4px 10px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 12,
    fontWeight: 600,
    background: 'var(--color-app-accent-soft)',
    color: 'var(--color-app-accent)',
    border: '1px solid var(--color-app-accent)',
  },
  tagChipRemove: {
    color: 'inherit',
    textDecoration: 'none',
    fontSize: 14,
    lineHeight: 1,
    padding: '0 4px',
  },
  rowTag: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 11,
    fontWeight: 600,
    background: 'var(--color-slate-50)',
    color: 'var(--fg2)',
    border: '1px solid var(--border)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  rowTagActive: {
    background: 'var(--color-app-accent-soft)',
    color: 'var(--color-app-accent)',
    borderColor: 'var(--color-app-accent)',
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
