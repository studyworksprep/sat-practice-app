// Admin draft editor with side-by-side preview.
//
// Layout: the current questions_v2 row on the left, the proposed
// draft (merged onto the current row — NULL draft fields fall back
// to current values) on the right, both rendered through
// <QuestionRenderer mode="teacher"> so they display identically to
// what a teacher sees in /tutor/review.
//
// Below the preview: the raw HTML editor (four textareas + options
// jsonb + notes + status) with save / promote / reject buttons.
//
// Math preview is live per save — saveDraft re-renders the preview
// by recomputing the server-side render on every load. Fast enough
// (MathJax warmup ~1.5s cold, ~50ms per expression after) because
// the serverless function stays warm across a session.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { Card } from '@/lib/ui/Card';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { renderRow } from '@/lib/content/render-math.mjs';
import {
  extractMcqCorrectId,
  formatSprCorrect,
} from '@/lib/practice/correct-answer';
import { saveDraft, promoteDraft, rejectDraft } from './actions';

export const dynamic = 'force-dynamic';

export default async function DraftEditorPage({ params }) {
  const { draftId } = await params;
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') redirect('/');

  const { data: draft } = await supabase
    .from('question_content_drafts')
    .select(`
      id, question_id, status, notes,
      stem_html, stimulus_html, rationale_html, options,
      created_at, updated_at, created_by, promoted_at
    `)
    .eq('id', draftId)
    .maybeSingle();

  if (!draft) notFound();

  const { data: current } = await supabase
    .from('questions_v2')
    .select(`
      id, display_code, question_type,
      stem_html, stimulus_html, rationale_html, options, correct_answer,
      domain_name, skill_name, difficulty, score_band, source
    `)
    .eq('id', draft.question_id)
    .maybeSingle();

  if (!current) notFound();

  // Merge: draft fields override current row fields, NULL means
  // "leave as-is". This is the same rule promoteDraft will apply.
  const merged = {
    stem_html:      draft.stem_html      ?? current.stem_html,
    stimulus_html:  draft.stimulus_html  ?? current.stimulus_html,
    rationale_html: draft.rationale_html ?? current.rationale_html,
    options:        draft.options        ?? current.options,
  };

  // Render both sides through the shared math-renderer. If there's
  // no math, the fields pass through unchanged and the read path
  // still renders fine via QuestionRenderer's dangerouslySetInnerHTML.
  const currentRendered = renderRow({ id: 'current', ...current });
  const mergedRendered  = renderRow({ id: 'merged',  ...merged });

  const currentVM = buildVM(current, currentRendered, current);
  const mergedVM  = buildVM(merged,  mergedRendered,  current);

  const isPromoted = draft.status === 'promoted';

  return (
    <main style={S.main}>
      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/admin/content/drafts" style={S.backLink}>← Drafts</Link>
      </nav>

      <header style={S.header}>
        <div>
          <h1 style={S.h1}>
            {current.display_code || current.id.slice(0, 8)}
          </h1>
          <div style={S.sub}>
            Draft <code>{draft.id.slice(0, 8)}</code> · status <strong>{draft.status}</strong> ·
            updated {formatDate(draft.updated_at)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link
            href={`/tutor/review/${current.id}`}
            target="_blank"
            style={S.secondaryBtn}
          >
            Open in review
          </Link>
        </div>
      </header>

      <section style={S.panes}>
        <div style={S.pane}>
          <h2 style={S.paneTitle}>Current (production)</h2>
          <Card style={{ padding: '1rem' }}>
            <QuestionRenderer mode="teacher" question={currentVM.question} result={currentVM.result} />
          </Card>
        </div>
        <div style={S.pane}>
          <h2 style={S.paneTitle}>Draft (proposed)</h2>
          <Card style={{ padding: '1rem', borderColor: '#2563eb', borderWidth: 2, borderStyle: 'solid' }}>
            <QuestionRenderer mode="teacher" question={mergedVM.question} result={mergedVM.result} />
          </Card>
        </div>
      </section>

      {isPromoted ? (
        <Card style={{ padding: '1rem', background: '#f3f4f6', marginTop: '1.5rem' }}>
          This draft was promoted on {formatDate(draft.promoted_at)}. It&apos;s
          read-only from here — edit <code>questions_v2</code> directly (or
          create a new draft) to propose further changes.
        </Card>
      ) : (
        <DraftEditor draft={draft} />
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────
// Editor form. Kept as a Server Component with inline <form
// action={saveDraft}> so there's no client JS for the edit path
// — admin sessions don't need live validation. Promote / reject
// live in separate <form> elements so they submit independently.
// ──────────────────────────────────────────────────────────────

function DraftEditor({ draft }) {
  const saveBound = saveDraft.bind(null, draft.id);
  const promoteBound = promoteDraft.bind(null, draft.id);
  const rejectBound = rejectDraft.bind(null, draft.id);

  return (
    <section style={{ marginTop: '1.5rem' }}>
      <form action={saveBound} style={S.form}>
        <h2 style={S.paneTitle}>Edit</h2>
        <Field label="stem_html" name="stem_html" value={draft.stem_html} />
        <Field label="stimulus_html" name="stimulus_html" value={draft.stimulus_html} />
        <Field label="rationale_html" name="rationale_html" value={draft.rationale_html} />
        <Field
          label="options (JSON array of { label, ordinal, content_html })"
          name="options"
          value={draft.options == null ? '' : JSON.stringify(draft.options, null, 2)}
          rows={8}
          mono
        />
        <Field label="notes" name="notes" value={draft.notes} rows={3} />
        <label style={S.label}>
          status
          <select name="status" defaultValue={draft.status} style={S.select}>
            <option value="pending">pending</option>
            <option value="review">review</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>
        </label>
        <div style={S.rowNote}>
          Leave a field blank to leave the corresponding column on
          questions_v2 unchanged. Promotion copies only the non-blank
          fields onto the production row.
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="submit" style={S.primaryBtn}>Save</button>
        </div>
      </form>

      <form action={promoteBound} style={{ marginTop: '1rem' }}>
        <button type="submit" style={S.promoteBtn}>Promote to production →</button>
      </form>

      <form action={rejectBound} style={{ marginTop: '0.5rem' }}>
        <button type="submit" style={S.dangerBtn}>Reject</button>
      </form>
    </section>
  );
}

function Field({ label, name, value, rows = 5, mono = false }) {
  return (
    <label style={S.label}>
      {label}
      <textarea
        name={name}
        defaultValue={value ?? ''}
        rows={rows}
        style={{
          ...S.textarea,
          fontFamily: mono ? 'ui-monospace, Menlo, Consolas, monospace' : 'inherit',
          fontSize: mono ? '0.85rem' : '0.95rem',
        }}
      />
    </label>
  );
}

// ──────────────────────────────────────────────────────────────
// VM builder: shapes questions_v2 + rendered fields into the
// { question, result } pair QuestionRenderer expects. correct_answer
// and taxonomy come from the `current` row only — drafts don't
// touch those fields.
// ──────────────────────────────────────────────────────────────

function buildVM(source, rendered, current) {
  const optsSrc = Array.isArray(rendered.options_rendered)
    ? rendered.options_rendered
    : Array.isArray(source.options)
      ? source.options
      : [];

  const options = optsSrc.map((opt, idx) => {
    const label = opt.label ?? opt.id ?? String.fromCharCode(65 + idx);
    return {
      id: label,
      label,
      content_html: opt.content_html_rendered ?? opt.content_html ?? opt.text ?? '',
    };
  });

  const isSpr = current.question_type === 'spr';

  return {
    question: {
      questionId: current.id,
      questionType: current.question_type,
      stimulusHtml: rendered.stimulus_rendered ?? source.stimulus_html,
      stemHtml:     rendered.stem_rendered     ?? source.stem_html,
      options,
      taxonomy: {
        domain_name: current.domain_name,
        skill_name:  current.skill_name,
        difficulty:  current.difficulty,
        source:      current.source,
      },
    },
    result: {
      correctOptionId:       !isSpr ? extractMcqCorrectId(current.correct_answer) : null,
      correctAnswerDisplay:  isSpr  ? formatSprCorrect(current.correct_answer)   : null,
      rationaleHtml:         rendered.rationale_rendered ?? source.rationale_html,
    },
  };
}

// ──────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────

const S = {
  main: { maxWidth: 1400, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  backLink: { color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '1rem', marginBottom: '1.5rem', paddingBottom: '0.75rem',
    borderBottom: '1px solid #e5e7eb',
  },
  h1: { fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  sub: { color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' },
  panes: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  pane: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  paneTitle: { fontSize: '0.85rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, fontWeight: 600 },
  form: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  label: { display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600, color: '#374151' },
  textarea: {
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db', borderRadius: 6,
    fontSize: '0.95rem', lineHeight: 1.4, resize: 'vertical', fontWeight: 400,
  },
  select: { padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.95rem', fontWeight: 400 },
  rowNote: { color: '#6b7280', fontSize: '0.8rem' },
  primaryBtn: {
    padding: '0.5rem 1rem', background: '#2563eb', color: 'white',
    border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer',
  },
  promoteBtn: {
    padding: '0.5rem 1rem', background: '#16a34a', color: 'white',
    border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer',
  },
  dangerBtn: {
    padding: '0.5rem 1rem', background: 'white', color: '#991b1b',
    border: '1px solid #fca5a5', borderRadius: 6, fontWeight: 600, cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '0.375rem 0.75rem', background: 'white', color: '#374151',
    border: '1px solid #d1d5db', borderRadius: 6, fontWeight: 500,
    textDecoration: 'none', fontSize: '0.9rem',
  },
};
