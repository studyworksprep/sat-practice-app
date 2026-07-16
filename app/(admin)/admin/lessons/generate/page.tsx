// Admin · Lessons · Generate with AI — server shell.
//
// Loads the shared prompt template (stored override in
// ai_prompt_templates, else the code-side default) and mounts the
// client component with the two input areas. Generation posts to
// /api/admin/lessons/generate, which creates a draft lesson and its
// blocks; the client then navigates into the existing block editor
// for review.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import {
  DEFAULT_LESSON_PROMPT_TEMPLATE,
  LESSON_GEN_TEMPLATE_NAME,
} from '@/lib/admin/lessonGenPrompt';
import { GenerateClient } from './GenerateClient';
import a from '../../../admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminLessonsGeneratePage() {
  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const { data: stored } = await supabase
    .from('ai_prompt_templates')
    .select('template')
    .eq('name', LESSON_GEN_TEMPLATE_NAME)
    .maybeSingle();

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href="/admin/lessons">← Lessons</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Lessons</div>
        <h1 className={a.h1}>Generate lesson with AI</h1>
        <p className={a.sub}>
          Describe the lesson you want — topic, audience, objectives, length,
          source material — and Claude drafts it as text sections,
          comprehension checks, video placeholders, and practice-question
          links. The draft opens in the block editor for review; nothing is
          visible to students until you publish it.
        </p>
      </header>

      <GenerateClient
        initialTemplate={stored?.template ?? DEFAULT_LESSON_PROMPT_TEMPLATE}
        isCustomized={Boolean(stored)}
      />
    </main>
  );
}
