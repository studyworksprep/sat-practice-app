import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { CSSProperties } from 'react';
import { requireUser } from '@/lib/api/auth';
import { Button } from '@/lib/ui/Button';
import type { Json } from '@/lib/types';
import { LessonSlideshow } from '@/lib/ui/LessonSlideshow';
import { EditorClient } from '@/app/(admin)/admin/lessons/[lessonId]/EditorClient';
import {
  addRevisionTopic,
  deleteRevision,
  removeRevisionTopic,
  saveRevisionBlocks,
  submitRevision,
  updateRevisionMetadata,
} from './actions';
import a from '@/app/(admin)/admin.module.css';
import f from '@/app/(admin)/forms.module.css';

export const dynamic = 'force-dynamic';

const EDITABLE = new Set(['draft', 'changes_requested']);

type PreviewBlock = {
  id: string;
  source_block_id: string | null;
  sort_order: number;
  block_type: string;
  content: Json;
};

const Slideshow = LessonSlideshow as unknown as (props: {
  blocks: PreviewBlock[];
  questionLinkHref: string | null;
  showCompleteButton?: boolean;
  calculatorStoragePrefix: string;
}) => React.ReactElement;

type DirectFormAction = (formData: FormData) => void | Promise<void>;
const submitDraftAction = submitRevision as unknown as DirectFormAction;

type DraftRevision = {
  id: string;
  base_lesson_id: string | null;
  published_lesson_id: string | null;
  owner_id: string;
  state: string;
  title: string;
  description: string | null;
  kind: string;
  foundation_sequence: number | null;
  change_summary: string | null;
  review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  updated_at: string;
  base: { id: string; title: string; updated_at: string } | null;
};

export default async function TutorLessonDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ revisionId: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { revisionId } = await params;
  const sp = (await searchParams) ?? {};
  const { user, profile, supabase } = await requireUser();
  if (profile.role === 'admin') redirect(`/admin/lessons/review/${revisionId}`);
  if (!['teacher', 'manager'].includes(profile.role)) redirect('/dashboard');

  const [{ data: revisionData }, { data: blocks }, { data: topics }] = await Promise.all([
    supabase.from('lesson_revisions').select(`
      id, base_lesson_id, published_lesson_id, owner_id, state, title, description, kind,
      foundation_sequence, change_summary, review_note, submitted_at,
      reviewed_at, updated_at,
      base:lessons!lesson_revisions_base_lesson_id_fkey(id, title, updated_at)
    `).eq('id', revisionId).eq('owner_id', user.id).maybeSingle(),
    supabase.from('lesson_revision_blocks')
      .select('id, source_block_id, sort_order, block_type, content').eq('revision_id', revisionId).order('sort_order'),
    supabase.from('lesson_revision_topics')
      .select('id, source_topic_id, section, domain_name, skill_code, pattern_id, question_patterns(name)')
      .eq('revision_id', revisionId),
  ]);
  if (!revisionData) notFound();
  const revision = revisionData as unknown as DraftRevision;

  const editable = EDITABLE.has(revision.state);
  return (
    <main className={a.container}>
      <nav className={a.breadcrumb} style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Link href="/tutor/lessons">← Lesson library</Link>
        {revision.base_lesson_id && (
          <Link href={`/tutor/lessons/${revision.base_lesson_id}/preview`}>Preview published source ↗</Link>
        )}
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>
          {revision.base_lesson_id ? 'Lesson proposal' : 'New lesson proposal'} · {stateLabel(revision.state)}
        </div>
        <h1 className={a.h1}>{revision.title}</h1>
        <p className={a.sub}>
          {revision.base?.title ? `Based on “${revision.base.title}”. ` : ''}
          {editable
            ? 'Your changes are private until you submit them for admin review.'
            : 'This version is read-only in its current workflow state.'}
        </p>
      </header>

      {sp.submitted === '1' && <div style={S.success}>Submitted for admin review.</div>}
      {revision.state === 'approved' && revision.published_lesson_id && (
        <div style={S.success}>
          Published. <Link href={`/tutor/lessons/${revision.published_lesson_id}/preview`}>Preview the canonical lesson →</Link>
        </div>
      )}
      {revision.state === 'changes_requested' && revision.review_note && (
        <section className={a.section} style={S.requested}>
          <h2 className={a.h2}>Changes requested</h2>
          <p style={{ margin: 0 }}>{revision.review_note}</p>
        </section>
      )}
      {revision.review_note && ['rejected', 'approved'].includes(revision.state) && (
        <section className={a.section}>
          <h2 className={a.h2}>Admin review note</h2>
          <p style={{ margin: 0 }}>{revision.review_note}</p>
        </section>
      )}

      {editable ? (
        <>
          <EditorClient
            lesson={{ ...revision, status: 'draft', visibility: 'private' }}
            initialBlocks={blocks ?? []}
            topics={topics ?? []}
            revisionMode
            actions={{
              updateMetadata: updateRevisionMetadata,
              saveBlocks: saveRevisionBlocks,
              deleteLesson: deleteRevision,
              addTopic: addRevisionTopic,
              removeTopic: removeRevisionTopic,
            }}
          />
          <section className={a.section} style={S.submitSection}>
            <div>
              <h2 className={a.h2}>Submit for review</h2>
              <p className={a.help}>
                Save metadata and blocks first. Submission locks the draft while an admin reviews it.
              </p>
            </div>
            <form action={submitDraftAction} className={f.form}>
              <input type="hidden" name="revision_id" value={revision.id} />
              <label className={f.label}>
                <span className={f.labelText}>Reviewer summary</span>
                <textarea
                  name="change_summary"
                  defaultValue={revision.change_summary ?? ''}
                  placeholder="What did you create or improve, and what should the reviewer check?"
                  className={f.input}
                  rows={4}
                  required
                  minLength={10}
                />
              </label>
              <div><Button type="submit">Submit for admin review</Button></div>
            </form>
          </section>
        </>
      ) : (
        <section className={a.section}>
          <div>
            <h2 className={a.h2}>Submitted preview</h2>
            {revision.change_summary && <p className={a.help}>{revision.change_summary}</p>}
          </div>
          <Slideshow
            blocks={blocks ?? []}
            questionLinkHref={null}
            showCompleteButton={false}
            calculatorStoragePrefix={`lesson-revision:${revision.id}`}
          />
        </section>
      )}
    </main>
  );
}

function stateLabel(state: string) {
  return ({
    draft: 'Draft', submitted: 'In review', changes_requested: 'Changes requested',
    approved: 'Published', rejected: 'Rejected', withdrawn: 'Withdrawn',
  } as Record<string, string>)[state] ?? state;
}

const S = {
  success: { padding: '10px 14px', border: '1px solid var(--color-success)', borderRadius: 8, background: 'var(--color-success-bg)', color: 'var(--color-diff-easy-fg)' },
  requested: { borderColor: 'var(--color-diff-med-fg)', background: 'var(--color-diff-med-bg)' },
  submitSection: { borderColor: 'var(--color-app-accent)' },
} satisfies Record<string, CSSProperties>;
