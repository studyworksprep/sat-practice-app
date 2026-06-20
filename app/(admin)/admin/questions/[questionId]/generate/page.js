// Admin "Generate alternate version with AI" page. Shows the source
// question for reference, then the GenerateAlternate client which calls
// Claude and loads the result into the authoring editor for review /
// edit before saving as an unpublished source='generated' row.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { Card } from '@/lib/ui/Card';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { inferLayoutMode } from '@/lib/ui/question-layout';
import { renderRow } from '@/lib/content/render-math.mjs';
import { extractMcqCorrectId, formatSprCorrect } from '@/lib/practice/correct-answer';
import { GenerateAlternate } from './GenerateAlternate';

export const dynamic = 'force-dynamic';

export default async function GenerateQuestionPage({ params }) {
  const { questionId } = await params;
  const { profile, supabase } = await requireUser();
  if (profile.role !== 'admin') redirect('/');

  const { data: q } = await supabase
    .from('questions_v2')
    .select(`
      id, display_code, question_type,
      stimulus_html, stem_html, rationale_html, options, correct_answer,
      stimulus_rendered, stem_rendered, rationale_rendered, options_rendered,
      domain_code, domain_name, skill_name, difficulty, source, deleted_at
    `)
    .eq('id', questionId)
    .maybeSingle();

  if (!q || q.deleted_at) notFound();

  const vm = buildVM(q);

  return (
    <main style={S.main}>
      <nav style={{ marginBottom: '1rem' }}>
        <Link href={`/admin/questions/${q.id}`} style={S.backLink}>← Back to question</Link>
      </nav>

      <header style={S.header}>
        <div style={S.eyebrow}>AI authoring</div>
        <h1 style={S.h1}>Generate alternate version</h1>
        <p style={S.sub}>
          Source: <code>{q.display_code || q.id.slice(0, 8)}</code> · {q.domain_name}
          {q.skill_name ? ` · ${q.skill_name}` : ''}
        </p>
      </header>

      <section style={S.refSection}>
        <h2 style={S.refTitle}>Original (for reference)</h2>
        <Card style={{ padding: '1rem' }}>
          <QuestionRenderer
            mode="teacher"
            layout={inferLayoutMode(q.domain_code)}
            question={vm.question}
            result={vm.result}
          />
        </Card>
      </section>

      <GenerateAlternate sourceId={q.id} />
    </main>
  );
}

function buildVM(q) {
  const optsSrc = Array.isArray(q.options_rendered)
    ? q.options_rendered
    : Array.isArray(q.options)
      ? q.options
      : [];
  const rendered = renderRow({
    id: q.id,
    stem_html: q.stem_html,
    stimulus_html: q.stimulus_html,
    rationale_html: q.rationale_html,
    options: q.options,
  });

  const options = optsSrc.map((opt, idx) => {
    const label = opt.label ?? opt.id ?? String.fromCharCode(65 + idx);
    return { id: label, label, content_html: opt.content_html_rendered ?? opt.content_html ?? opt.text ?? '' };
  });

  const isSpr = q.question_type === 'spr';
  return {
    question: {
      questionId: q.id,
      questionType: q.question_type,
      stimulusHtml: q.stimulus_rendered ?? rendered.stimulus_rendered ?? q.stimulus_html,
      stemHtml: q.stem_rendered ?? rendered.stem_rendered ?? q.stem_html,
      options,
      taxonomy: { domain_name: q.domain_name, skill_name: q.skill_name, difficulty: q.difficulty, source: q.source },
    },
    result: {
      correctOptionId: !isSpr ? extractMcqCorrectId(q.correct_answer) : null,
      correctAnswerDisplay: isSpr ? formatSprCorrect(q.correct_answer) : null,
      rationaleHtml: q.rationale_rendered ?? rendered.rationale_rendered ?? q.rationale_html,
    },
  };
}

const S = {
  main: { maxWidth: 960, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  backLink: { color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' },
  header: { marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e5e7eb' },
  eyebrow: { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af' },
  h1: { fontSize: '1.6rem', fontWeight: 700, margin: '0.15rem 0 0.35rem' },
  sub: { color: '#6b7280', fontSize: '0.9rem', margin: 0 },
  refSection: { marginBottom: '1.5rem' },
  refTitle: { fontSize: '0.8rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem', fontWeight: 600 },
};
