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

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { Button } from '@/lib/ui/Button';
import { Table, Th, Td } from '@/lib/ui/Table';
import { formatDate } from '@/lib/formatters';
import a from '../../admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminLessonsPage({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const imported = typeof sp.imported === 'string' ? sp.imported : '';

  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const [{ data: lessons }, { data: blockCounts }] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, title, description, status, visibility, author_id, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(500),
    supabase
      .from('lesson_blocks')
      .select('lesson_id'),
  ]);

  const countByLesson = {};
  for (const row of blockCounts ?? []) {
    countByLesson[row.lesson_id] = (countByLesson[row.lesson_id] ?? 0) + 1;
  }

  const authorIds = [...new Set((lessons ?? []).map((l) => l.author_id).filter(Boolean))];
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
          LessonTemplateSpec JSON document, or open an existing lesson in
          the legacy editor to edit its blocks.
        </p>
      </header>

      {imported && (
        <div style={S.flash}>
          Imported lesson <code>{imported.slice(0, 8)}</code> created.
        </div>
      )}

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
        <h2 className={a.h2}>All lessons ({lessons?.length ?? 0})</h2>
        {(lessons ?? []).length === 0 ? (
          <p className={a.help}>No lessons yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Author</Th>
                <Th>Status</Th>
                <Th>Visibility</Th>
                <Th style={{ textAlign: 'right' }}>Blocks</Th>
                <Th>Updated</Th>
                <Th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {(lessons ?? []).map((l) => (
                <tr key={l.id}>
                  <Td>
                    <div style={S.title}>{l.title || <em>Untitled</em>}</div>
                    {l.description && (
                      <div style={S.desc}>{l.description}</div>
                    )}
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
                  <Td style={{ color: 'var(--fg3)', fontSize: 12 }}>
                    {formatDate(l.updated_at) || '—'}
                  </Td>
                  <Td>
                    <a href={`/admin/lessons/${l.id}/editor`} style={S.link}>
                      Edit
                    </a>
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
};
