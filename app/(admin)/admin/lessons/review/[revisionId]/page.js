import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { LessonSlideshow } from '@/lib/ui/LessonSlideshow';
import { ReviewActions } from './ReviewActions';
import { publishRevision, rejectRevision, requestRevisionChanges } from './actions';
import a from '@/app/(admin)/admin.module.css';

export const dynamic = 'force-dynamic';

export default async function LessonReviewPage({ params }) {
  const { revisionId } = await params;
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') {
    if (['teacher', 'manager'].includes(profile.role)) redirect(`/tutor/lessons/drafts/${revisionId}`);
    redirect('/dashboard');
  }

  const [{ data: revision }, { data: proposedBlocks }, { data: proposedTopics }] = await Promise.all([
    supabase.from('lesson_revisions').select(`
      id, base_lesson_id, base_lesson_updated_at, owner_id, state, title,
      description, kind, foundation_sequence, change_summary, review_note,
      submitted_at, reviewed_at,
      owner:profiles!lesson_revisions_owner_id_fkey(first_name, last_name, email),
      base:lessons!lesson_revisions_base_lesson_id_fkey(
        id, title, description, kind, foundation_sequence, updated_at, status, visibility
      )
    `).eq('id', revisionId).maybeSingle(),
    supabase.from('lesson_revision_blocks')
      .select('id, source_block_id, sort_order, block_type, content').eq('revision_id', revisionId).order('sort_order'),
    supabase.from('lesson_revision_topics')
      .select('id, source_topic_id, section, domain_name, skill_code, pattern_id').eq('revision_id', revisionId),
  ]);
  if (!revision) notFound();

  let baseBlocks = [];
  let baseTopics = [];
  if (revision.base_lesson_id) {
    const [blocksResult, topicsResult] = await Promise.all([
      supabase.from('lesson_blocks').select('id, sort_order, block_type, content')
        .eq('lesson_id', revision.base_lesson_id).order('sort_order'),
      supabase.from('lesson_topics').select('id, section, domain_name, skill_code, pattern_id')
        .eq('lesson_id', revision.base_lesson_id),
    ]);
    baseBlocks = blocksResult.data ?? [];
    baseTopics = topicsResult.data ?? [];
  }

  const diff = summarizeDiff(revision, proposedBlocks ?? [], proposedTopics ?? [], baseBlocks, baseTopics);
  const sourceChanged = revision.base &&
    new Date(revision.base.updated_at).getTime() !== new Date(revision.base_lesson_updated_at).getTime();
  const contributor = [revision.owner?.first_name, revision.owner?.last_name].filter(Boolean).join(' ')
    || revision.owner?.email || 'Tutor';

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}><Link href="/admin/lessons/review">← Review queue</Link></nav>
      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Lesson proposal · {stateLabel(revision.state)}</div>
        <h1 className={a.h1}>{revision.title}</h1>
        <p className={a.sub}>
          Submitted by {contributor}. {revision.base ? `Proposed update to “${revision.base.title}”.` : 'Proposed new lesson.'}
        </p>
      </header>

      {sourceChanged && (
        <section className={a.section} style={S.conflict}>
          <h2 className={a.h2}>Source lesson changed</h2>
          <p style={{ margin: 0 }}>
            The canonical lesson was updated after this proposal began. Compare both versions carefully. You can request changes, or use the explicitly labeled override below after confirming this proposal should replace the newer source.
          </p>
        </section>
      )}

      <section className={a.section}>
        <h2 className={a.h2}>Contributor summary</h2>
        <p style={{ margin: 0 }}>{revision.change_summary || 'No summary provided.'}</p>
      </section>

      <section className={a.section}>
        <h2 className={a.h2}>Change overview</h2>
        <div style={S.stats}>
          <Stat label="Metadata fields" value={diff.metadataChanges.length} />
          <Stat label="Blocks added" value={diff.blocksAdded} />
          <Stat label="Blocks changed" value={diff.blocksChanged} />
          <Stat label="Blocks removed" value={diff.blocksRemoved} />
          <Stat label="Topic changes" value={diff.topicChanges} />
        </div>
        {diff.metadataChanges.length > 0 && (
          <p className={a.help}>Changed: {diff.metadataChanges.join(', ')}</p>
        )}
      </section>

      <section className={a.section}>
        <h2 className={a.h2}>Proposed student experience</h2>
        <LessonSlideshow
          blocks={proposedBlocks ?? []}
          questionLinkHref={null}
          showCompleteButton={false}
          calculatorStoragePrefix={`admin-revision-preview:${revision.id}`}
        />
      </section>

      {revision.base && (
        <details className={a.section}>
          <summary style={S.summary}>Compare with current published lesson</summary>
          <LessonSlideshow
            blocks={baseBlocks}
            questionLinkHref={null}
            showCompleteButton={false}
            calculatorStoragePrefix={`admin-source-preview:${revision.base.id}`}
          />
        </details>
      )}

      <section className={a.section} style={S.review}>
        <h2 className={a.h2}>Review decision</h2>
        {revision.state === 'submitted' ? (
          <ReviewActions
            revisionId={revision.id}
            publishAction={publishRevision}
            requestChangesAction={requestRevisionChanges}
            rejectAction={rejectRevision}
            sourceChanged={sourceChanged}
          />
        ) : (
          <p style={{ margin: 0 }}>
            This proposal is {stateLabel(revision.state).toLowerCase()}.
            {revision.review_note ? ` Review note: ${revision.review_note}` : ''}
          </p>
        )}
      </section>
    </main>
  );
}

function summarizeDiff(revision, proposedBlocks, proposedTopics, baseBlocks, baseTopics) {
  const metadataChanges = [];
  if (!revision.base) metadataChanges.push('new lesson');
  else {
    for (const field of ['title', 'description', 'kind', 'foundation_sequence']) {
      if ((revision[field] ?? null) !== (revision.base[field] ?? null)) metadataChanges.push(field.replaceAll('_', ' '));
    }
  }
  const baseById = new Map(baseBlocks.map((block) => [block.id, block]));
  const proposedSourceIds = new Set(proposedBlocks.map((block) => block.source_block_id).filter(Boolean));
  let blocksAdded = 0;
  let blocksChanged = 0;
  for (const block of proposedBlocks) {
    const original = block.source_block_id ? baseById.get(block.source_block_id) : null;
    if (!original) blocksAdded += 1;
    else if (JSON.stringify([block.sort_order, block.block_type, block.content])
      !== JSON.stringify([original.sort_order, original.block_type, original.content])) blocksChanged += 1;
  }
  let blocksRemoved = 0;
  for (const block of baseBlocks) if (!proposedSourceIds.has(block.id)) blocksRemoved += 1;
  const topicKey = (topic) => [topic.section, topic.domain_name, topic.skill_code, topic.pattern_id].map((v) => v ?? '').join('|');
  const baseTopicKeys = new Set(baseTopics.map(topicKey));
  const proposedTopicKeys = new Set(proposedTopics.map(topicKey));
  let topicChanges = 0;
  for (const key of proposedTopicKeys) if (!baseTopicKeys.has(key)) topicChanges += 1;
  for (const key of baseTopicKeys) if (!proposedTopicKeys.has(key)) topicChanges += 1;
  return { metadataChanges, blocksAdded, blocksChanged, blocksRemoved, topicChanges };
}

function Stat({ label, value }) { return <div style={S.stat}><strong>{value}</strong><span>{label}</span></div>; }
function stateLabel(state) { return ({ draft: 'Draft', submitted: 'Awaiting review', changes_requested: 'Changes requested', approved: 'Published', rejected: 'Rejected', withdrawn: 'Withdrawn' })[state] ?? state; }
const S = {
  conflict: { borderColor: 'var(--color-diff-hard-fg)', background: 'var(--color-diff-hard-bg)' },
  stats: { display: 'flex', flexWrap: 'wrap', gap: 12 },
  stat: { minWidth: 120, padding: 12, border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 3 },
  summary: { cursor: 'pointer', fontWeight: 700, color: 'var(--color-navy-900)' },
  review: { borderColor: 'var(--color-app-accent)' },
};
