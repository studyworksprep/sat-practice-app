// Admin · Lessons · Import — server shell.
//
// Mounts the client component that runs the LessonTemplateSpec
// compiler + validator live as the user types/pastes. Submission
// goes to the colocated Server Action in actions.js, which re-
// validates and then inserts the lesson + blocks atomically.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { ImportClient } from './ImportClient';
import { createLessonFromSpec } from './actions';
import a from '../../../admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminLessonsImportPage() {
  const { profile } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href="/admin/lessons">← Lessons</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Lessons</div>
        <h1 className={a.h1}>Import lesson from JSON</h1>
        <p className={a.sub}>
          Paste a LessonTemplateSpec — title, description, and a list of
          blocks. The compiler expands workflow specs (graph_comparison_workflow,
          slider_workflow, branching_question) into the underlying lesson
          blocks and runs the validator before saving.
        </p>
      </header>

      <ImportClient action={createLessonFromSpec} />
    </main>
  );
}
