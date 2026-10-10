// Admin → ACT → Questions → one question. Loads the row plus its
// answer options (RLS: admins read everything, including broken and
// retired rows) and hands them to the client editor, which owns the
// preview / edit toggle and calls the Server Actions in ../actions.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { formatDateTime } from '@/lib/formatters';
import { sectionLabel } from '@/lib/practice/act-taxonomy';
import { ActQuestionEditor } from './ActQuestionEditor';
import type { ActQuestionRow, ActOptionRow } from './ActQuestionEditor';
import s from '../ActQuestions.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminActQuestionPage({
  params,
}: {
  params: Promise<{ questionId: string }>;
}) {
  const { questionId } = await params;
  let supabase;
  try {
    ({ supabase } = await requireRole(['admin']));
  } catch {
    redirect('/');
  }

  const [{ data: question }, { data: options }, { data: attemptStats }] = await Promise.all([
    supabase
      .from('act_questions')
      .select(`
        id, external_id, section, category, category_code, subcategory, subcategory_code,
        is_modeling, difficulty, difficulty_source, question_type, stimulus_html, stem_html,
        rationale_html, source_test, source_ordinal, is_broken, deleted_at, created_at, updated_at, updated_by
      `)
      .eq('id', questionId)
      .maybeSingle(),
    supabase
      .from('act_answer_options')
      .select('id, ordinal, label, content_html, is_correct')
      .eq('question_id', questionId)
      // Sort by label, not ordinal — see fix_act_option_ordinals.sql.
      .order('label', { ascending: true }),
    // Attempt volume gives the admin a sense of blast radius before
    // flagging or retiring. RLS lets admins read every attempt.
    supabase
      .from('act_attempts')
      .select('is_correct', { count: 'exact', head: false })
      .eq('question_id', questionId),
  ]);
  if (!question) notFound();

  const attempts = (attemptStats ?? []) as Array<{ is_correct: boolean }>;
  const attemptCount = attempts.length;
  const correctCount = attempts.filter((a) => a.is_correct).length;

  const q = question as ActQuestionRow;
  const heading = [
    q.source_test ?? 'Unfiled',
    sectionLabel(q.section),
    q.source_ordinal != null ? `Q${q.source_ordinal}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <main className={s.container}>
      <header className={s.header}>
        <Link href="/admin/act/questions" className={s.backLink}>← ACT questions</Link>
        <div className={s.titleRow}>
          <h1 className={s.h1}>{heading}</h1>
          <div className={s.actions}>
            {q.is_broken && <span className={`${s.pill} ${s.pillDanger}`}>broken</span>}
            {q.deleted_at && <span className={`${s.pill} ${s.pillWarn}`}>retired</span>}
          </div>
        </div>
        <div className={s.meta}>
          <span className={s.mono}>{q.id}</span>
          {q.external_id && <span>external id <span className={s.mono}>{q.external_id}</span></span>}
          <span>
            {attemptCount} attempt{attemptCount === 1 ? '' : 's'}
            {attemptCount > 0 ? ` · ${Math.round((correctCount / attemptCount) * 100)}% correct` : ''}
          </span>
          <span>updated {formatDateTime(q.updated_at) || '—'}</span>
        </div>
      </header>

      <ActQuestionEditor
        question={q}
        options={(options ?? []) as ActOptionRow[]}
      />
    </main>
  );
}
