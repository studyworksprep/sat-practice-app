import { NextResponse } from 'next/server';
import { requireServiceRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';
import { extractMcqCorrectId } from '@/lib/practice/correct-answer';
import { fetchClaudeMessages, extractToolUse } from '@/lib/admin/claude';
import {
  GENERATE_MODEL,
  SYSTEM_PROMPT,
  RETURN_GENERATED_QUESTION_TOOL,
} from '@/lib/admin/generateQuestionPrompt';

// ============================================================
// POST /api/admin/questions-v2/generate
// ============================================================
// Admin-only. Given { id } of an existing questions_v2 row, asks
// Claude to write an ORIGINAL alternate question in the same domain /
// skill that tests the same concept, and returns the generated fields
// (clean bank HTML) WITHOUT saving anything. The admin authoring
// editor loads the result for review/edit and, on submit, inserts it
// as an unpublished source='generated' row via the createQuestion
// Server Action.

// Adaptive-thinking generation can run longer than the platform default,
// so give the serverless function more headroom.
export const maxDuration = 60;

export const POST = legacyApiRoute(async (request) => {
  const { service: admin } = await requireServiceRole(
    'admin questions-v2 generate — read a question to seed AI generation',
    { allowedRoles: ['admin'] },
  );

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const id = body?.id;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data: row, error: loadErr } = await admin
    .from('questions_v2')
    .select(
      'id, question_type, stimulus_html, stem_html, rationale_html, options, correct_answer, domain_code, domain_name, skill_code, skill_name, difficulty',
    )
    .eq('id', id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'question not found' }, { status: 404 });

  const userPayload = buildSourcePayload(row);

  try {
    // Adaptive thinking lets the model actually work the algebra and the
    // trap-procedure construction before it answers, which materially
    // improves distractor quality. (Forced tool_choice is incompatible
    // with thinking, so we use auto + a firm "call the tool once"
    // instruction and validate the tool_use came back.)
    const response = await fetchClaudeMessages({
      model: GENERATE_MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [RETURN_GENERATED_QUESTION_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: JSON.stringify(userPayload) }],
    });

    const generated = extractToolUse(response, RETURN_GENERATED_QUESTION_TOOL.name);
    if (!generated || typeof generated.stem_html !== 'string' || !generated.stem_html.trim()) {
      return NextResponse.json(
        { error: 'Claude did not return a usable question. Try regenerating.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      generated: normalizeGenerated(generated, row.question_type),
      source: {
        question_type: row.question_type,
        domain_code: row.domain_code,
        skill_code: row.skill_code,
        domain_name: row.domain_name,
        skill_name: row.skill_name,
        difficulty: row.difficulty,
      },
    });
  } catch (e) {
    console.error('questions-v2/generate error:', e);
    return NextResponse.json({ error: e.message || 'Claude request failed' }, { status: 500 });
  }
});

// Shape the source row into the compact JSON Claude expects.
function buildSourcePayload(row) {
  const correctId = extractMcqCorrectId(row.correct_answer);
  const correctLabels = mcqCorrectLabels(row.correct_answer);

  const options = Array.isArray(row.options)
    ? row.options
        .slice()
        .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
        .map((o) => ({
          label: o.label,
          content_html: o.content_html || '',
          is_correct: correctLabels.length
            ? correctLabels.includes(String(o.label))
            : String(o.label) === correctId,
        }))
    : [];

  return {
    question_type: row.question_type,
    domain_name: row.domain_name,
    skill_name: row.skill_name,
    difficulty: row.difficulty,
    stimulus_html: row.stimulus_html || null,
    stem_html: row.stem_html || '',
    rationale_html: row.rationale_html || null,
    options: row.question_type === 'mcq' ? options : [],
    spr_answers: row.question_type === 'spr' ? sprAcceptedAnswers(row.correct_answer) : [],
    has_figure: hasFigure(row),
  };
}

function mcqCorrectLabels(correct) {
  if (correct && typeof correct === 'object' && Array.isArray(correct.option_labels)) {
    return correct.option_labels.map(String);
  }
  return [];
}

function sprAcceptedAnswers(correct) {
  if (correct == null) return [];
  if (typeof correct === 'string') return [correct];
  if (Array.isArray(correct)) return correct.map(String);
  if (typeof correct === 'object') {
    if (typeof correct.text === 'string' && correct.text) {
      try {
        const parsed = JSON.parse(correct.text);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch { /* fall through */ }
      return [correct.text];
    }
    if (typeof correct.number === 'number') return [String(correct.number)];
  }
  return [];
}

function hasFigure(row) {
  const parts = [row.stimulus_html || '', row.stem_html || ''];
  if (Array.isArray(row.options)) for (const o of row.options) parts.push(o?.content_html || '');
  const joined = parts.join('\n');
  return /<img\b/i.test(joined) || /<svg\b/i.test(joined);
}

// Defensive normalization so the client always gets a consistent shape.
function normalizeGenerated(g, questionType) {
  const options = Array.isArray(g.options)
    ? g.options
        .filter((o) => o && typeof o.content_html === 'string')
        .map((o, i) => ({
          label: o.label || String.fromCharCode(65 + i),
          content_html: o.content_html,
          is_correct: o.is_correct === true,
        }))
    : [];

  return {
    question_type: questionType,
    stem_html: g.stem_html,
    stimulus_html: typeof g.stimulus_html === 'string' ? g.stimulus_html : null,
    rationale_html: typeof g.rationale_html === 'string' ? g.rationale_html : null,
    options: questionType === 'mcq' ? options : [],
    spr_answers: Array.isArray(g.spr_answers) ? g.spr_answers.map(String).filter(Boolean) : [],
    distractor_notes: typeof g.distractor_notes === 'string' ? g.distractor_notes : '',
    figure_needed: g.figure_needed === true,
    figure_description: typeof g.figure_description === 'string' ? g.figure_description : null,
  };
}
