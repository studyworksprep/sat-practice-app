// Admin → ACT → Questions. Paginated browser over act_questions
// with the filters the Phase 2 content work needs: by form, by
// section, broken / retired, missing rationale, missing difficulty,
// and a stem text search. Each row links to the editor at
// /admin/act/questions/<id>.
//
// Plain GET-form filters so every view is a bookmarkable URL
// (same pattern as /admin/questions on the SAT side).
//
// URL params (all optional):
//   ?form=<source_test>   ?section=english|math|reading|science
//   ?q=<text>             substring match on stem_html
//   ?broken=1             only is_broken rows
//   ?retired=1            only soft-deleted rows (hidden by default)
//   ?rationale=missing|present
//   ?difficulty=missing
//   ?page=N               1-indexed; 50 rows per page

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { ACT_SECTIONS, sectionLabel } from '@/lib/practice/act-taxonomy';
import s from './ActQuestions.module.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type SearchParams = Record<string, string | string[] | undefined>;

interface Filters {
  form: string;
  section: string;
  q: string;
  broken: boolean;
  retired: boolean;
  rationale: '' | 'missing' | 'present';
  difficulty: '' | 'missing';
}

interface ListRow {
  id: string;
  source_test: string | null;
  source_ordinal: number | null;
  section: string;
  category: string;
  category_code: string | null;
  difficulty: number | null;
  difficulty_source: string | null;
  is_broken: boolean;
  deleted_at: string | null;
  rationale_html: string | null;
  stem_html: string;
  updated_at: string;
}

function one(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v.trim() : '';
}

export default async function AdminActQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  let supabase;
  try {
    ({ supabase } = await requireRole(['admin']));
  } catch {
    redirect('/');
  }

  const rationaleParam = one(sp.rationale);
  const difficultyParam = one(sp.difficulty);
  const filters: Filters = {
    form: one(sp.form),
    section: one(sp.section),
    q: one(sp.q),
    broken: one(sp.broken) === '1',
    retired: one(sp.retired) === '1',
    rationale: rationaleParam === 'missing' || rationaleParam === 'present' ? rationaleParam : '',
    difficulty: difficultyParam === 'missing' ? 'missing' : '',
  };
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('act_questions')
    .select(
      'id, source_test, source_ordinal, section, category, category_code, difficulty, difficulty_source, is_broken, deleted_at, rationale_html, stem_html, updated_at',
      { count: 'exact' },
    );
  // Retired rows are hidden unless asked for, so the default view
  // matches what the import review approved and students can reach.
  query = filters.retired ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
  if (filters.form) query = query.eq('source_test', filters.form);
  if (filters.section) query = query.eq('section', filters.section);
  if (filters.broken) query = query.eq('is_broken', true);
  if (filters.rationale === 'missing') query = query.or('rationale_html.is.null,rationale_html.eq.');
  if (filters.rationale === 'present') query = query.not('rationale_html', 'is', null).neq('rationale_html', '');
  if (filters.difficulty === 'missing') query = query.is('difficulty', null);
  if (filters.q) query = query.ilike('stem_html', `%${filters.q.replace(/[%_]/g, '')}%`);

  const [{ data: rows, count, error }, { data: formRows }] = await Promise.all([
    query
      .order('source_test', { ascending: true, nullsFirst: false })
      .order('section', { ascending: true })
      .order('source_ordinal', { ascending: true, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1),
    supabase
      .from('act_questions')
      .select('source_test')
      .not('source_test', 'is', null),
  ]);

  const forms = Array.from(
    new Set(((formRows ?? []) as Array<{ source_test: string | null }>).map((r) => r.source_test).filter(Boolean) as string[]),
  ).sort();

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const list = (rows ?? []) as ListRow[];

  return (
    <main className={s.container}>
      <header className={s.header}>
        <Link href="/admin" className={s.backLink}>← Admin</Link>
        <div className={s.titleRow}>
          <h1 className={s.h1}>ACT questions</h1>
          <div className={s.actions}>
            <Link href="/admin/act/imports" className={s.btnSecondary}>Imports</Link>
            <Link href="/admin/act/score-conversion" className={s.btnSecondary}>Score conversion</Link>
          </div>
        </div>
        <p className={s.sub}>
          {error
            ? `Query failed: ${error.message}`
            : `${total.toLocaleString()} question${total === 1 ? '' : 's'} match · page ${page} of ${lastPage}`}
        </p>
      </header>

      <FilterBar filters={filters} forms={forms} />

      {list.length === 0 ? (
        <div className={s.empty}>No questions match these filters.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>Form</th>
                <th className={s.th}>Section</th>
                <th className={`${s.th} ${s.tdNum}`}>#</th>
                <th className={s.th}>Category</th>
                <th className={`${s.th} ${s.tdNum}`}>Diff</th>
                <th className={s.th}>Rationale</th>
                <th className={s.th}>Flags</th>
                <th className={s.th}>Stem</th>
                <th className={s.th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td className={`${s.td} ${s.mono}`}>
                    <Link href={`/admin/act/questions/${r.id}`} className={s.rowLink}>
                      {r.source_test ?? r.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className={s.td}>{sectionLabel(r.section)}</td>
                  <td className={`${s.td} ${s.tdNum}`}>{r.source_ordinal ?? '—'}</td>
                  <td className={s.td}>
                    {r.category}
                    {r.category_code ? <span className={s.mono}> · {r.category_code}</span> : null}
                  </td>
                  <td className={`${s.td} ${s.tdNum}`} title={r.difficulty_source ?? undefined}>
                    {r.difficulty ?? '—'}
                    {r.difficulty != null && r.difficulty_source === 'ai_estimate' ? '*' : ''}
                  </td>
                  <td className={s.td}>
                    {r.rationale_html && r.rationale_html.trim() !== ''
                      ? <span className={`${s.pill} ${s.pillOk}`}>present</span>
                      : <span className={`${s.pill} ${s.pillMuted}`}>missing</span>}
                  </td>
                  <td className={s.td}>
                    {r.is_broken && <span className={`${s.pill} ${s.pillDanger}`}>broken</span>}{' '}
                    {r.deleted_at && <span className={`${s.pill} ${s.pillWarn}`}>retired</span>}
                  </td>
                  <td className={s.td}><span className={s.snippet}>{snippet(r.stem_html)}</span></td>
                  <td className={s.td} style={{ whiteSpace: 'nowrap', color: 'var(--fg3)' }}>
                    {formatDate(r.updated_at) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} lastPage={lastPage} filters={filters} />
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function FilterBar({ filters, forms }: { filters: Filters; forms: string[] }) {
  return (
    <form action="/admin/act/questions" method="get" className={s.filterBar}>
      <input
        type="text"
        name="q"
        defaultValue={filters.q}
        placeholder="Search stem text…"
        className={s.search}
      />
      <select name="form" defaultValue={filters.form} className={s.select} aria-label="Form">
        <option value="">All forms</option>
        {forms.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <select name="section" defaultValue={filters.section} className={s.select} aria-label="Section">
        <option value="">All sections</option>
        {ACT_SECTIONS.map((sec) => <option key={sec} value={sec}>{sectionLabel(sec)}</option>)}
      </select>
      <select name="rationale" defaultValue={filters.rationale} className={s.select} aria-label="Rationale">
        <option value="">Any rationale</option>
        <option value="missing">Rationale missing</option>
        <option value="present">Rationale present</option>
      </select>
      <select name="difficulty" defaultValue={filters.difficulty} className={s.select} aria-label="Difficulty">
        <option value="">Any difficulty</option>
        <option value="missing">Difficulty missing</option>
      </select>
      <label className={s.toggle}>
        <input type="checkbox" name="broken" value="1" defaultChecked={filters.broken} />
        Broken only
      </label>
      <label className={s.toggle}>
        <input type="checkbox" name="retired" value="1" defaultChecked={filters.retired} />
        Retired only
      </label>
      <button type="submit" className={s.btnSecondary}>Apply</button>
      <Link href="/admin/act/questions" className={s.clearLink}>Clear</Link>
    </form>
  );
}

function toUrl(filters: Filters, page: number): string {
  const p = new URLSearchParams();
  if (filters.q) p.set('q', filters.q);
  if (filters.form) p.set('form', filters.form);
  if (filters.section) p.set('section', filters.section);
  if (filters.rationale) p.set('rationale', filters.rationale);
  if (filters.difficulty) p.set('difficulty', filters.difficulty);
  if (filters.broken) p.set('broken', '1');
  if (filters.retired) p.set('retired', '1');
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  return qs ? `/admin/act/questions?${qs}` : '/admin/act/questions';
}

function Pagination({ page, lastPage, filters }: { page: number; lastPage: number; filters: Filters }) {
  if (lastPage <= 1) return null;
  return (
    <nav className={s.pagination} aria-label="Pagination">
      {page > 1
        ? <Link href={toUrl(filters, page - 1)} className={s.pageLink}>← Previous</Link>
        : <span className={s.pageLinkDisabled}>← Previous</span>}
      <span>Page {page} of {lastPage}</span>
      {page < lastPage
        ? <Link href={toUrl(filters, page + 1)} className={s.pageLink}>Next →</Link>
        : <span className={s.pageLinkDisabled}>Next →</span>}
    </nav>
  );
}

function snippet(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}
