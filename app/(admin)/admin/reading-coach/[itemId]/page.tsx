// Admin · Reading Coach — item detail: version history, full preview
// of a selected version (default: newest), and publish/archive
// controls. Preview renders the stored (already sanitized) HTML and
// the gold rubrics exactly as the evaluator will receive them.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import {
  getReadingCoachItem,
  getReadingCoachVersionChoices,
} from '@/lib/reading-coach/content';
import type {
  ReadingCoachSource,
  StoredVersionRubric,
} from '@/lib/reading-coach/types';
import { ItemActions } from './ItemActions';
import a from '../../../admin.module.css';
import f from '../../../forms.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminReadingCoachItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const { itemId } = await params;
  const { v } = await searchParams;

  const detail = await getReadingCoachItem(supabase, itemId);
  if (!detail) notFound();
  const { item, versions } = detail;

  const requested = v ? versions.find((x) => String(x.version_number) === v) : undefined;
  const preview = requested ?? versions[0];
  const choices = preview
    ? await getReadingCoachVersionChoices(supabase, preview.id)
    : [];
  const rubric = (preview?.rubric ?? null) as StoredVersionRubric | null;
  const source = item.source_metadata as unknown as ReadingCoachSource | null;

  const latestDraft = versions.find((x) => x.published_at === null) ?? null;

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <Link href="/admin/reading-coach">← Reading Coach</Link>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Reading Coach</div>
        <h1 className={a.h1}>{item.title}</h1>
        <p className={a.sub}>
          {item.slug} — {item.genre}, difficulty {item.difficulty}, status{' '}
          {item.status}
          {source?.rightsStatus ? `, rights ${source.rightsStatus}` : ''}
        </p>
      </header>

      <ItemActions
        itemId={item.id}
        itemStatus={item.status}
        draftVersionId={latestDraft?.id ?? null}
        draftVersionNumber={latestDraft?.version_number ?? null}
      />

      <section className={a.section}>
        <h2 className={a.sectionLabel}>Versions</h2>
        <div className={f.tableWrap}>
          <table className={f.table}>
            <thead>
              <tr>
                <th className={f.th}>Version</th>
                <th className={f.th}>Created</th>
                <th className={f.th}>Published</th>
                <th className={f.th}>Live</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((ver) => (
                <tr key={ver.id}>
                  <td className={f.td}>
                    <Link
                      className={a.link}
                      href={`/admin/reading-coach/${item.id}?v=${ver.version_number}`}
                    >
                      v{ver.version_number}
                    </Link>
                    {preview?.id === ver.id ? ' (previewing)' : ''}
                  </td>
                  <td className={f.tdMuted}>
                    {new Date(ver.created_at).toLocaleString()}
                  </td>
                  <td className={f.tdMuted}>
                    {ver.published_at
                      ? new Date(ver.published_at).toLocaleString()
                      : 'draft'}
                  </td>
                  <td className={f.td}>
                    {item.current_version_id === ver.id ? '● live' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {preview && rubric && (
        <section className={a.section}>
          <h2 className={a.sectionLabel}>
            Preview — v{preview.version_number} ({preview.task_type},{' '}
            {preview.processing_mode})
          </h2>

          <h3 className={f.subhead}>Question stem</h3>
          <div dangerouslySetInnerHTML={{ __html: preview.question_stem_html }} />

          <h3 className={f.subhead}>Passage</h3>
          <div dangerouslySetInnerHTML={{ __html: preview.passage_html }} />

          <h3 className={f.subhead}>Task rubric</h3>
          <p className={f.hint}>{rubric.taskRubric.canonicalTask}</p>
          <RubricLists
            entries={[
              ['Required ideas', rubric.taskRubric.requiredIdeas],
              ['Acceptable variants', rubric.taskRubric.acceptableVariants],
              ['Common wrong tasks', rubric.taskRubric.commonWrongTasks],
            ]}
          />

          <h3 className={f.subhead}>
            Processing units ({rubric.processingUnits.length})
          </h3>
          {rubric.processingUnits.map((u) => (
            <div key={u.key}>
              <p className={f.hint}>
                <strong>{u.key}</strong>
              </p>
              <div dangerouslySetInnerHTML={{ __html: u.textHtml }} />
              <RubricLists
                entries={[
                  ['Required ideas', u.requiredIdeas],
                  ['Required relations', u.requiredRelations],
                  ['Acceptable omissions', u.acceptableOmissions],
                  ['Prohibited distortions', u.prohibitedDistortions],
                ]}
              />
            </div>
          ))}

          <h3 className={f.subhead}>Passage rubric</h3>
          <p className={f.hint}>{rubric.passageRubric.canonicalSummary}</p>
          <RubricLists
            entries={[
              ['Required ideas', rubric.passageRubric.requiredIdeas],
              ['Required relations', rubric.passageRubric.requiredRelations],
              ['Acceptable omissions', rubric.passageRubric.acceptableOmissions],
              ['Prohibited distortions', rubric.passageRubric.prohibitedDistortions],
            ]}
          />

          <h3 className={f.subhead}>Pre-answer rubric</h3>
          <p className={f.hint}>{rubric.preanswerRubric.canonicalPreanswer}</p>
          <RubricLists
            entries={[
              ['Required ideas', rubric.preanswerRubric.requiredIdeas],
              ['Acceptable variants', rubric.preanswerRubric.acceptableVariants],
              ['Prohibited claims', rubric.preanswerRubric.prohibitedClaims],
            ]}
          />

          <h3 className={f.subhead}>Choices</h3>
          {choices.map((c) => (
            <div key={c.id}>
              <p className={f.hint}>
                <strong>
                  {c.label}
                  {c.is_correct ? ' ✓ correct' : ''}
                </strong>
                {c.error_code ? ` — ${c.error_code}` : ''}
              </p>
              <div dangerouslySetInnerHTML={{ __html: c.choice_html }} />
              <div
                className={f.muted}
                dangerouslySetInnerHTML={{ __html: c.rationale_html }}
              />
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

function RubricLists({ entries }: { entries: [string, string[]][] }) {
  return (
    <>
      {entries
        .filter(([, values]) => values.length > 0)
        .map(([label, values]) => (
          <p key={label} className={f.hint}>
            <strong>{label}:</strong> {values.join(' · ')}
          </p>
        ))}
    </>
  );
}
