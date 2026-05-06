// Admin · Lesson editor — Server shell.
//
// Loads the lesson and its blocks server-side and hands them to
// EditorClient for the interactive editing experience. Admin-only.
//
// The legacy editor at app/admin/lessons/[lessonId]/editor/page.js
// covers the same surface but in a single ~1000-line client
// component with in-component fetch. This carve-out keeps the
// fetch on the server (one round-trip, cached profile reuse) and
// scopes mutations to colocated Server Actions.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { EditorClient } from './EditorClient';
import {
  saveLessonBlocks,
  updateLessonMetadata,
  deleteLesson,
} from './actions';
import a from '../../../admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminLessonEditPage({ params }) {
  const { lessonId } = await params;

  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const [{ data: lesson }, { data: blocks }] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, title, description, status, visibility, author_id, created_at, updated_at')
      .eq('id', lessonId)
      .maybeSingle(),
    supabase
      .from('lesson_blocks')
      .select('id, sort_order, block_type, content')
      .eq('lesson_id', lessonId)
      .order('sort_order'),
  ]);

  if (!lesson) notFound();

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href="/admin/lessons">← Lessons</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Lesson</div>
        <h1 className={a.h1}>{lesson.title || 'Untitled lesson'}</h1>
        <p className={a.sub}>
          ID <code>{lesson.id}</code> · {(blocks ?? []).length} block(s) ·{' '}
          status {lesson.status} · visibility {lesson.visibility}
        </p>
      </header>

      <EditorClient
        lesson={lesson}
        initialBlocks={blocks ?? []}
        actions={{
          updateMetadata: updateLessonMetadata,
          saveBlocks: saveLessonBlocks,
          deleteLesson,
        }}
      />
    </main>
  );
}
