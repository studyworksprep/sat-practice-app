'use client';

// Client driver for "Generate alternate version with AI". Calls the
// generate API, converts the returned bank HTML into editor content,
// and hands it to the shared authoring editor (QuestionAuthor) so the
// admin can edit on the spot and then save it as an unpublished,
// source='generated' question.

import { useState } from 'react';
import { QuestionAuthor } from '../../new/QuestionAuthor';
import { bankHtmlToEditorHtml } from '@/lib/content/bank-html-to-editor';

export function GenerateAlternate({ sourceId }) {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [initial, setInitial] = useState(null);
  const [notes, setNotes] = useState('');
  const [genKey, setGenKey] = useState(0);

  async function generate() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/admin/questions-v2/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sourceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setInitial(buildInitial(data));
      setNotes(typeof data.generated?.distractor_notes === 'string' ? data.generated.distractor_notes : '');
      setGenKey((k) => k + 1);
      setStatus('ready');
    } catch (e) {
      setError(e.message || String(e));
      setStatus('error');
    }
  }

  if (status === 'idle' || status === 'loading' || status === 'error') {
    return (
      <div style={S.intro}>
        <p style={S.lead}>
          Claude will write an original new question in the same domain and
          skill that tests the same concept at the same difficulty, with
          trap-aligned answer choices. You can edit it here before saving — it
          becomes an unpublished <code>generated</code> question.
        </p>
        {status === 'error' && <div style={S.error}>{error}</div>}
        <button type="button" onClick={generate} disabled={status === 'loading'} style={S.genBtn}>
          {status === 'loading' ? 'Generating… (up to ~30s)' : '✨ Generate with AI'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={S.readyBar}>
        <span>
          <strong>AI-generated draft.</strong> Review and edit below, then
          create the question.
        </span>
        <button type="button" onClick={generate} style={S.regenBtn}>↻ Regenerate</button>
      </div>
      {notes && (
        <div style={S.notes}>
          <strong>Distractor logic (verify):</strong> {notes}
        </div>
      )}
      <QuestionAuthor
        key={genKey}
        initial={initial}
        source="generated"
        submitLabel="Create generated question"
      />
    </div>
  );
}

function buildInitial(data) {
  const g = data.generated;
  const src = data.source ?? {};
  const options = Array.isArray(g.options) ? g.options : [];
  const correctIndex =
    g.question_type === 'mcq'
      ? Math.max(0, options.findIndex((o) => o.is_correct))
      : 0;

  return {
    questionType: g.question_type,
    domainCode: src.domain_code || '',
    skillCode: src.skill_code || '',
    difficulty: src.difficulty ?? '',
    stimulusHtml: bankHtmlToEditorHtml(g.stimulus_html),
    stemHtml: bankHtmlToEditorHtml(g.stem_html),
    rationaleHtml: bankHtmlToEditorHtml(g.rationale_html),
    options: options.map((o) => ({ contentHtml: bankHtmlToEditorHtml(o.content_html) })),
    correctIndex,
    sprAnswers: (g.spr_answers || []).join('\n'),
    figureNote: g.figure_needed
      ? (g.figure_description || 'This question should include a figure.')
      : null,
  };
}

const S = {
  intro: { border: '1px solid #e5e7eb', borderRadius: 10, padding: '1.25rem', background: '#fff' },
  lead: { margin: '0 0 1rem', color: '#374151', fontSize: '0.95rem', lineHeight: 1.55 },
  genBtn: { padding: '0.6rem 1.2rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' },
  regenBtn: { padding: '0.4rem 0.85rem', background: '#fff', color: '#6d28d9', border: '1px solid #ddd6fe', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' },
  readyBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', padding: '0.6rem 0.85rem', marginBottom: '1rem', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, color: '#5b21b6', fontSize: '0.9rem' },
  notes: { padding: '0.6rem 0.85rem', marginBottom: '1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: '0.85rem', lineHeight: 1.5 },
  error: { padding: '0.6rem 0.85rem', marginBottom: '1rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, fontSize: '0.9rem' },
};
