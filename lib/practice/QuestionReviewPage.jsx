// Shared question-review page body, used by both
// /tutor/review/[questionId] and /admin/questions/[questionId].
//
// The two surfaces render the exact same content (full question +
// canonical answer + rationale + taxonomy + notes + flag controls)
// and the exact same data flow; only their breadcrumb and prev/next
// link base differ. Extracting this here keeps the two route files
// as thin wrappers and avoids drift when one side gets a new feature
// (concept tags, broken-button states, etc.) and the other doesn't.
//
// Why two URLs at all: (admin) and (tutor) are separate route groups
// with separate layouts (admin nav vs tutor nav). Per the parallel-
// build discipline in docs/architecture-plan.md §3.6, an admin click
// from /admin/questions should stay in the (admin) tree so the admin
// nav doesn't blink off mid-drill. The shared body below is what
// makes that cheap.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { Card } from '@/lib/ui/Card';
import { inferLayoutMode } from '@/lib/ui/question-layout';
import { extractMcqCorrectId, formatSprCorrect } from '@/lib/practice/correct-answer';
import { ConceptTags } from '@/lib/practice/ConceptTags';
import { loadConceptTags } from '@/lib/practice/load-concept-tags';
import { QuestionNotes } from '@/lib/practice/QuestionNotes';
import { loadQuestionNotes } from '@/lib/practice/load-question-notes';
import { BrokenButton } from '@/lib/practice/BrokenButton';
import { loadBrokenData } from '@/lib/practice/load-broken-data';

/**
 * @param {object} props
 * @param {string} props.questionId
 * @param {{ backHref: string, backLabel: string, baseHref: string }} props.chrome
 *   - backHref / backLabel: the breadcrumb at the top of the page
 *   - baseHref: prefix for prev/next links (e.g. '/tutor/review' or
 *     '/admin/questions'); the next/prev question id is appended.
 */
export async function QuestionReviewPage({ questionId, chrome }) {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  const { data: question } = await supabase
    .from('questions_v2')
    .select(`
      id, question_type, display_code, created_at,
      stimulus_html, stem_html, options, correct_answer, rationale_html,
      stimulus_rendered, stem_rendered, options_rendered, rationale_rendered,
      domain_code, domain_name, skill_name, difficulty, score_band, source,
      is_published, is_broken, deleted_at
    `)
    .eq('id', questionId)
    .maybeSingle();

  if (!question || question.deleted_at) notFound();

  // Walk the question bank by created_at desc — "previous" is the
  // newer neighbor (higher created_at), "next" is the older one.
  // (id is the tiebreaker for the rare same-timestamp case.)
  const [{ data: prevRow }, { data: nextRow }] = await Promise.all([
    supabase
      .from('questions_v2')
      .select('id')
      .or(
        `created_at.gt.${question.created_at},` +
          `and(created_at.eq.${question.created_at},id.gt.${question.id})`,
      )
      .eq('is_published', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('questions_v2')
      .select('id')
      .or(
        `created_at.lt.${question.created_at},` +
          `and(created_at.eq.${question.created_at},id.lt.${question.id})`,
      )
      .eq('is_published', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const prevId = prevRow?.id ?? null;
  const nextId = nextRow?.id ?? null;

  const optionsSource = Array.isArray(question.options_rendered)
    ? question.options_rendered
    : Array.isArray(question.options)
      ? question.options
      : [];
  const wmOptions = optionsSource.map((opt, idx) => {
    const label = opt.label ?? opt.id ?? String.fromCharCode(65 + idx);
    return {
      id: label,
      label,
      content_html:
        opt.content_html_rendered ?? opt.content_html ?? opt.text ?? '',
    };
  });

  const layout = inferLayoutMode(question.domain_code);
  const questionVM = {
    questionId: question.id,
    questionType: question.question_type,
    stimulusHtml: question.stimulus_rendered ?? question.stimulus_html,
    stemHtml: question.stem_rendered ?? question.stem_html,
    options: wmOptions,
    taxonomy: {
      domain_name: question.domain_name,
      skill_name: question.skill_name,
      difficulty: question.difficulty,
      source: question.source,
    },
  };

  const isSpr = question.question_type === 'spr';
  const resultVM = {
    correctOptionId: !isSpr ? extractMcqCorrectId(question.correct_answer) : null,
    correctAnswerDisplay: isSpr ? formatSprCorrect(question.correct_answer) : null,
    rationaleHtml: question.rationale_rendered ?? question.rationale_html,
  };

  const [conceptTags, questionNotes, brokenData] = await Promise.all([
    loadConceptTags({ questionId: question.id, role: profile.role }),
    loadQuestionNotes({ questionId: question.id, role: profile.role, userId: user.id }),
    loadBrokenData({ questionId: question.id, role: profile.role }),
  ]);

  return (
    <main style={S.main}>
      <nav style={{ marginBottom: '1rem' }}>
        <Link
          href={chrome.backHref}
          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' }}
        >
          ← {chrome.backLabel}
        </Link>
      </nav>

      <header style={S.header}>
        <div>
          <h1 style={S.h1}>Question review</h1>
          {question.display_code && (
            <div style={S.sub}>Code: <code>{question.display_code}</code></div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <NavBtn
            href={prevId ? `${chrome.baseHref}/${prevId}` : null}
            label="← Previous"
            title="Newer question (created_at descending)"
          />
          <NavBtn
            href={nextId ? `${chrome.baseHref}/${nextId}` : null}
            label="Next →"
            title="Older question (created_at descending)"
          />
          {!question.is_published && <Pill tone="warn">Unpublished</Pill>}
          {question.is_broken && <Pill tone="danger">Flagged</Pill>}
          {brokenData.canEdit && (
            <BrokenButton
              questionId={question.id}
              canEdit={brokenData.canEdit}
              initialIsBroken={brokenData.isBroken}
              raw={brokenData.raw}
              rendered={brokenData.rendered}
              taxonomy={brokenData.taxonomy}
              renderedSourceHash={brokenData.renderedSourceHash}
            />
          )}
        </div>
      </header>

      {question.is_broken && (
        <Card
          tone="warn"
          style={{ padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.9rem' }}
        >
          This question is flagged as broken. Students won&apos;t see it in
          new practice sessions; fix or retire it from the admin content
          page.
        </Card>
      )}

      <article style={S.article}>
        <QuestionRenderer
          mode="teacher"
          layout={layout}
          question={questionVM}
          result={resultVM}
          controlsNode={
            conceptTags.canTag ? (
              <div
                style={{
                  marginTop: '0.5rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px dashed var(--border)',
                  width: '100%',
                }}
              >
                <ConceptTags
                  questionId={question.id}
                  initialTags={conceptTags.tags}
                  initialQuestionTagIds={conceptTags.questionTagIds}
                  canTag={conceptTags.canTag}
                  canDelete={conceptTags.canDelete}
                />
              </div>
            ) : null
          }
        />
      </article>

      {questionNotes.canView && (
        <section
          style={{
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px dashed var(--border)',
          }}
        >
          <QuestionNotes
            questionId={question.id}
            initialNotes={questionNotes.notes}
            isAdmin={questionNotes.isAdmin}
            currentUserId={questionNotes.currentUserId}
            canView={questionNotes.canView}
          />
        </section>
      )}
    </main>
  );
}

function NavBtn({ href, label, title }) {
  const baseStyle = {
    display: 'inline-block',
    padding: '0.25rem 0.65rem',
    borderRadius: 6,
    fontSize: '0.8rem',
    fontWeight: 500,
    border: '1px solid var(--border, #e0d8c4)',
    background: 'var(--bg-card, #fff)',
    textDecoration: 'none',
  };
  if (!href) {
    return (
      <span
        style={{
          ...baseStyle,
          color: 'var(--text-muted, #999)',
          opacity: 0.5,
          cursor: 'not-allowed',
        }}
        title={title}
      >
        {label}
      </span>
    );
  }
  return (
    <Link href={href} style={{ ...baseStyle, color: 'var(--text, #1a1a1a)' }} title={title}>
      {label}
    </Link>
  );
}

function Pill({ tone, children }) {
  const colors = {
    danger: { bg: '#fee2e2', fg: '#991b1b' },
    warn:   { bg: '#fef3c7', fg: '#92400e' },
  }[tone] ?? { bg: '#f3f4f6', fg: '#374151' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.125rem 0.5rem',
      borderRadius: 999,
      fontSize: '0.7rem',
      fontWeight: 600,
      background: colors.bg,
      color: colors.fg,
    }}>
      {children}
    </span>
  );
}

const S = {
  main: { maxWidth: 900, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    marginBottom: '1.5rem',
    paddingBottom: '0.75rem',
    borderBottom: '1px solid #e5e7eb',
  },
  h1: { fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  sub: { color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' },
  article: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
};
