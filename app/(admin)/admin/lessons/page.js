// Admin · Lessons — index of every lesson in the library, plus the
// entry point for importing a lesson from JSON.
//
// The legacy import flow lives at /admin/lessons/[lessonId]/editor:
// it imports blocks INTO an existing lesson, so an admin first has
// to know which lesson to open. This page is the (next)-tree carve-
// out: it lets an admin import a *new* lesson straight from a
// LessonTemplateSpec JSON document (title + description + blocks),
// using the same compiler + validator as the legacy editor.
//
// Server Component. Per-row links are admin-only.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { Button } from '@/lib/ui/Button';
import { Table, Th, Td } from '@/lib/ui/Table';
import { formatDate } from '@/lib/formatters';
import { fetchAll } from '@/lib/api/paginate';
import { filterLessonCatalog, getLessonCatalogFacets } from '@/lib/lesson/catalog';
import { loadLessonCatalog } from '@/lib/lesson/catalog-server';
import { LessonCatalogFilterBar } from '@/lib/ui/LessonCatalogFilters';
import { LessonScopeChips } from '@/lib/ui/LessonScopeChips';
import { createLesson } from './actions';
import { refreshEfficacy } from './efficacy-actions';
import { DeleteLessonButton } from './DeleteLessonButton';
import a from '../../admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminLessonsPage({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const imported = typeof sp.imported === 'string' ? sp.imported : '';
  const deleted = sp.deleted === '1';
  const catalogFilters = {
    q: stringParam(sp.q),
    section: stringParam(sp.section),
    domain: stringParam(sp.domain),
    kind: stringParam(sp.kind),
    status: stringParam(sp.status),
    categorization: stringParam(sp.categorization) || 'all',
    sort: stringParam(sp.sort) || 'updated',
  };

  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  // Both of these are whole-table reads feeding a per-lesson tally, so
  // they go through `fetchAll`: a bare `.select()` stops at PostgREST's
  // row cap, and an unordered truncation drops whole lessons off the
  // tail — which the Blocks column then renders as a confident "0"
  // rather than as a failure.
  const [lessons, blockRows, efficacyRows] = await Promise.all([
    loadLessonCatalog(supabase, { limit: 500 }),
    fetchAll(
      () => supabase.from('lesson_blocks').select('id, lesson_id'),
      { order: { column: 'id' } },
    ),
    // §3.5 content efficacy — per (lesson, skill) pre/post accuracy
    // around lesson completion, materialized by
    // refresh_feature_efficacy(). Sparse until lessons + completions
    // accumulate; rows simply show "—" until then.
    fetchAll(
      () => supabase
        .from('feature_efficacy')
        .select('lesson_id, skill_code, pre_attempts, pre_correct, post_attempts, post_correct, students, refreshed_at'),
      { order: [{ column: 'lesson_id' }, { column: 'skill_code' }] },
    ),
  ]);
  const visibleLessons = filterLessonCatalog(lessons, catalogFilters);
  const catalogFacets = getLessonCatalogFacets(lessons);

  const countByLesson = {};
  for (const row of blockRows) {
    countByLesson[row.lesson_id] = (countByLesson[row.lesson_id] ?? 0) + 1;
  }

  // Roll skills up per lesson: attempts-weighted pre/post accuracy,
  // paired-student count summed across skills, per-skill detail for
  // the cell tooltip.
  const efficacyByLesson = {};
  let efficacyRefreshedAt = null;
  for (const r of efficacyRows) {
    const e = efficacyByLesson[r.lesson_id]
      ?? (efficacyByLesson[r.lesson_id] = {
        preAttempts: 0, preCorrect: 0, postAttempts: 0, postCorrect: 0,
        students: 0, skills: [],
      });
    e.preAttempts += r.pre_attempts ?? 0;
    e.preCorrect += r.pre_correct ?? 0;
    e.postAttempts += r.post_attempts ?? 0;
    e.postCorrect += r.post_correct ?? 0;
    e.students += r.students ?? 0;
    e.skills.push(
      `${r.skill_code}: ${pct(r.pre_correct, r.pre_attempts)} → ${pct(r.post_correct, r.post_attempts)} (${r.students} student${r.students === 1 ? '' : 's'})`,
    );
    if (!efficacyRefreshedAt || (r.refreshed_at && r.refreshed_at > efficacyRefreshedAt)) {
      efficacyRefreshedAt = r.refreshed_at;
    }
  }

  const authorIds = [...new Set(lessons.map((l) => l.author_id).filter(Boolean))];
  const authorMap = {};
  if (authorIds.length > 0) {
    const { data: authors } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', authorIds);
    for (const p of authors ?? []) {
      authorMap[p.id] =
        [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || p.id.slice(0, 8);
    }
  }

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href="/admin">← Admin</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Lessons</div>
        <h1 className={a.h1}>Lessons</h1>
        <p className={a.sub}>
          Every lesson in the content library. Import a new lesson from a
          LessonTemplateSpec JSON document, or open an existing lesson to
          edit its metadata and blocks.
        </p>
      </header>

      <section className={a.section}>
        <div style={S.cta}>
          <div>
            <h2 className={a.h2}>Tutor submissions</h2>
            <p className={a.help}>
              Review proposed lesson improvements and new lessons without mixing private drafts into the canonical library.
            </p>
          </div>
          <Link href="/admin/lessons/review">
            <Button variant="secondary">Open review queue</Button>
          </Link>
        </div>
      </section>

      {imported && (
        <div style={S.flash}>
          Imported lesson <code>{imported.slice(0, 8)}</code> created.
        </div>
      )}
      {deleted && <div style={S.flash}>Lesson deleted.</div>}
      {sp.efficacy === '1' && <div style={S.flash}>Efficacy refreshed.</div>}
      {typeof sp.efficacy_error === 'string' && sp.efficacy_error && (
        <div style={S.flashError}>
          Efficacy refresh failed: {sp.efficacy_error}
        </div>
      )}

      <section className={a.section}>
        <div style={S.cta}>
          <div>
            <h2 className={a.h2}>Create a lesson</h2>
            <p className={a.help}>
              Start from a blank lesson and build it visually — add text,
              images, video, interactive questions, practice questions, and
              Desmos interactions block by block.
            </p>
          </div>
          <form action={createLesson}>
            <Button type="submit" variant="primary">
              Create lesson
            </Button>
          </form>
        </div>
      </section>

      <section className={a.section}>
        <div style={S.cta}>
          <div>
            <h2 className={a.h2}>Generate with AI</h2>
            <p className={a.help}>
              Describe the lesson you want — topic, audience, objectives,
              length — and Claude drafts it as text sections, comprehension
              checks, video placeholders, and practice-question links. The
              draft opens in the block editor for review before publishing.
            </p>
          </div>
          <a href="/admin/lessons/generate">
            <Button variant="primary">✨ Generate lesson</Button>
          </a>
        </div>
      </section>

      <section className={a.section}>
        <div style={S.cta}>
          <div>
            <h2 className={a.h2}>Import from JSON</h2>
            <p className={a.help}>
              Paste a LessonTemplateSpec — title, description, and a list
              of blocks (text, graph_comparison_workflow, slider_workflow,
              branching_question, desmos_enter_expression, raw_block) — and
              we&rsquo;ll compile it into a new lesson.
            </p>
          </div>
          <a href="/admin/lessons/import">
            <Button variant="primary">Import lesson</Button>
          </a>
        </div>
      </section>

      <section className={a.section}>
        <div style={S.cta}>
          <div>
            <h2 className={a.h2}>
              All lessons ({visibleLessons.length === lessons.length
                ? lessons.length
                : `${visibleLessons.length} of ${lessons.length}`})
            </h2>
            <p className={a.help}>
              Efficacy = first-attempt practice accuracy on each lesson&rsquo;s
              tagged skills, before → after students completed the lesson
              (paired students only).
              {efficacyRefreshedAt
                ? ` Last refreshed ${formatDate(efficacyRefreshedAt)}.`
                : ' Not computed yet.'}
            </p>
          </div>
          <form action={refreshEfficacy}>
            <Button type="submit" variant="secondary">Refresh efficacy</Button>
          </form>
        </div>
        <LessonCatalogFilterBar
          action="/admin/lessons"
          filters={catalogFilters}
          facets={catalogFacets}
          showStatus
          showCategorization
        />
        {lessons.length === 0 ? (
          <p className={a.help}>No lessons yet.</p>
        ) : visibleLessons.length === 0 ? (
          <p className={a.help}>
            No lessons match these filters. <Link href="/admin/lessons">Clear filters</Link>
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Author</Th>
                <Th>Status</Th>
                <Th>Visibility</Th>
                <Th style={{ textAlign: 'right' }}>Blocks</Th>
                <Th>Efficacy</Th>
                <Th>Updated</Th>
                <Th style={{ width: 220 }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visibleLessons.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <div style={S.title}>{l.title || <em>Untitled</em>}</div>
                    {l.description && (
                      <div style={S.desc}>{l.description}</div>
                    )}
                    <LessonScopeChips lesson={l} includeKind />
                  </Td>
                  <Td>{authorMap[l.author_id] ?? '—'}</Td>
                  <Td>
                    <span style={{ ...S.pill, ...statusStyle(l.status) }}>
                      {l.status}
                    </span>
                  </Td>
                  <Td>{l.visibility}</Td>
                  <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {countByLesson[l.id] ?? 0}
                  </Td>
                  <Td>
                    <EfficacyCell entry={efficacyByLesson[l.id]} />
                  </Td>
                  <Td style={{ color: 'var(--fg3)', fontSize: 12 }}>
                    {formatDate(l.updated_at) || '—'}
                  </Td>
                  <Td>
                    <div style={S.rowActions}>
                      <a href={`/admin/lessons/${l.id}`} style={S.link}>
                        Edit
                      </a>
                      <a href={`/admin/lessons/${l.id}/import`} style={S.link}>
                        Import JSON
                      </a>
                      <DeleteLessonButton lessonId={l.id} title={l.title || ''} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </main>
  );
}

// §3.5 efficacy cell — attempts-weighted pre → post accuracy across
// the lesson's tagged skills, with the per-skill split in the title
// tooltip. "—" until the lesson has paired completion data.
function EfficacyCell({ entry }) {
  if (!entry || entry.preAttempts === 0 || entry.postAttempts === 0) {
    return <span style={{ color: 'var(--fg3)' }}>—</span>;
  }
  const pre = pct(entry.preCorrect, entry.preAttempts);
  const post = pct(entry.postCorrect, entry.postAttempts);
  const improved = entry.postCorrect / entry.postAttempts
    >= entry.preCorrect / entry.preAttempts;
  return (
    <span
      title={entry.skills.join('\n')}
      style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
    >
      {pre} → <strong style={{
        color: improved ? 'var(--color-diff-easy-fg)' : 'var(--color-diff-hard-fg)',
      }}
      >{post}
      </strong>
      <span style={{ color: 'var(--fg3)', fontSize: 12 }}>
        {' '}· {entry.students} student{entry.students === 1 ? '' : 's'}
      </span>
    </span>
  );
}

function pct(correct, attempts) {
  if (!attempts) return '—';
  return `${Math.round((correct / attempts) * 100)}%`;
}

function stringParam(value) {
  return typeof value === 'string' ? value : '';
}

function statusStyle(status) {
  if (status === 'published') {
    return {
      background: 'var(--color-success-bg)',
      color: 'var(--color-diff-easy-fg)',
      borderColor: 'var(--color-success)',
    };
  }
  if (status === 'archived') {
    return {
      background: 'var(--color-slate-100)',
      color: 'var(--fg3)',
      borderColor: 'var(--border-strong)',
    };
  }
  return {
    background: 'var(--color-diff-med-bg)',
    color: 'var(--color-diff-med-fg)',
    borderColor: 'var(--color-diff-med-bd)',
  };
}

const S = {
  cta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
  },
  flash: {
    padding: '10px 14px',
    background: 'var(--color-success-bg)',
    color: 'var(--color-diff-easy-fg)',
    border: '1px solid var(--color-success)',
    borderRadius: 'var(--radius-md)',
    fontSize: 13,
  },
  flashError: {
    padding: '10px 14px',
    background: 'var(--color-diff-hard-bg, #fef2f2)',
    color: 'var(--color-diff-hard-fg)',
    border: '1px solid var(--color-diff-hard-fg)',
    borderRadius: 'var(--radius-md)',
    fontSize: 13,
  },
  title: { fontWeight: 600, color: 'var(--color-navy-900)' },
  desc: { color: 'var(--fg3)', fontSize: 12, marginTop: 2, maxWidth: 540 },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 10px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    border: '1px solid var(--border)',
  },
  link: { color: 'var(--color-app-accent)', textDecoration: 'none', fontWeight: 600 },
  rowActions: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
};
