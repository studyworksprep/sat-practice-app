import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../lib/supabase/server';

// POST /api/admin/bulk-reocr
// Accepts a PDF file (one question per page), sends to Mathpix OCR, then Claude.
// Returns array of { question_id, stem_html, stimulus_html, options[], matched, current } for preview.
export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const formData = await request.formData();
  const pdf = formData.get('pdf');
  if (!pdf) return NextResponse.json({ error: 'pdf file is required' }, { status: 400 });

  try {
    // Step 1: Mathpix OCR
    const mmdText = await mathpixPdfToMmd(pdf);

    // Step 2: Claude extraction
    const questions = await extractSatQuestionsWithClaude(mmdText);

    // Step 2b: Post-process — try to recover missing IDs from raw OCR text.
    // The OCR often contains "ID: XXXXXXXX" lines that Claude may have missed.
    if (questions.some(q => !q.question_id)) {
      // Split raw OCR by likely page boundaries and extract IDs
      const pages = mmdText.split(/\n{3,}(?=ID:|\\#|---)/i);
      const idPattern = /\bID:\s*([a-f0-9]{6,}(?:-[A-Z]{2})?)\b/gi;
      const allIds = [];
      let match;
      while ((match = idPattern.exec(mmdText)) !== null) {
        allIds.push(match[1]);
      }
      // Also try bare hex IDs at line starts
      const bareIdPattern = /^([a-f0-9]{8})\b/gm;
      while ((match = bareIdPattern.exec(mmdText)) !== null) {
        if (!allIds.includes(match[1])) allIds.push(match[1]);
      }
      // Assign unmatched IDs to null-ID questions in order
      let idIdx = 0;
      for (const q of questions) {
        if (!q.question_id && idIdx < allIds.length) {
          q.question_id = allIds[idIdx];
        }
        idIdx++;
      }
    }

    // Step 3: Match each question to the database
    const admin = createServiceClient();
    for (const q of questions) {
      if (!q.question_id) { q.matched = false; continue; }

      // Look up by question_id text field
      const { data: versions } = await admin
        .from('question_versions')
        .select('id, question_id, stem_html, stimulus_html, question_type')
        .eq('question_id', q.question_id)
        .eq('is_current', true)
        .limit(1);

      const ver = versions?.[0];
      if (ver) {
        q.matched = true;
        q.version_id = ver.id;
        q.current_stem_html = ver.stem_html;
        q.current_stimulus_html = ver.stimulus_html;
        q.question_type = ver.question_type;

        // Fetch current options for comparison
        const { data: opts } = await admin
          .from('answer_options')
          .select('id, ordinal, label, content_html')
          .eq('question_version_id', ver.id)
          .order('ordinal');
        q.current_options = opts || [];
      } else {
        q.matched = false;
      }
    }

    return NextResponse.json({ ok: true, questions });
  } catch (e) {
    console.error('bulk-reocr error:', e);
    return NextResponse.json({ error: e.message || 'Failed to process PDF' }, { status: 500 });
  }
}

// PUT /api/admin/bulk-reocr
// Applies corrections to a single question version + its options
// Body: { version_id, stem_html, stimulus_html?, options?: [{ id, content_html }] }
export async function PUT(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { version_id, stem_html, stimulus_html, options } = await request.json();
  if (!version_id || !stem_html) {
    return NextResponse.json({ error: 'version_id and stem_html are required' }, { status: 400 });
  }

  const admin = createServiceClient();

  // Update question version
  const update = { stem_html };
  if (stimulus_html !== undefined) update.stimulus_html = stimulus_html;

  const { error: verErr } = await admin
    .from('question_versions')
    .update(update)
    .eq('id', version_id);

  if (verErr) return NextResponse.json({ error: `Version update failed: ${verErr.message}` }, { status: 400 });

  // Update answer options if provided
  if (Array.isArray(options)) {
    for (const opt of options) {
      if (!opt.id || !opt.content_html) continue;
      const { error: optErr } = await admin
        .from('answer_options')
        .update({ content_html: opt.content_html })
        .eq('id', opt.id);
      if (optErr) console.warn(`Failed to update option ${opt.id}: ${optErr.message}`);
    }
  }

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Mathpix: PDF → Markdown
// ---------------------------------------------------------------------------
async function mathpixPdfToMmd(file) {
  const appId = process.env.MATHPIX_APP_ID;
  const appKey = process.env.MATHPIX_APP_KEY;
  if (!appId || !appKey) throw new Error('MATHPIX_APP_ID and MATHPIX_APP_KEY env vars are required');

  const bytes = await file.arrayBuffer();
  const blob = new Blob([bytes], { type: 'application/pdf' });

  const uploadForm = new FormData();
  uploadForm.append('file', blob, file.name || 'upload.pdf');
  uploadForm.append('options_json', JSON.stringify({
    conversion_formats: { md: true },
    math_inline_delimiters: ['\\(', '\\)'],
    math_display_delimiters: ['\\[', '\\]'],
    enable_tables_fallback: true,
  }));

  const uploadRes = await fetch('https://api.mathpix.com/v3/pdf', {
    method: 'POST',
    headers: { app_id: appId, app_key: appKey },
    body: uploadForm,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Mathpix upload failed (${uploadRes.status}): ${text}`);
  }

  const { pdf_id } = await uploadRes.json();
  if (!pdf_id) throw new Error('Mathpix did not return a pdf_id');

  const maxWait = 300_000; // 5 minutes for large PDFs
  const pollInterval = 4_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));
    const statusRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}`, {
      headers: { app_id: appId, app_key: appKey },
    });
    if (!statusRes.ok) continue;
    const status = await statusRes.json();
    if (status.status === 'completed') {
      const mdRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}.md`, {
        headers: { app_id: appId, app_key: appKey },
      });
      if (!mdRes.ok) throw new Error('Failed to fetch Mathpix markdown output');
      return await mdRes.text();
    }
    if (status.status === 'error') throw new Error(`Mathpix error: ${status.error || 'unknown'}`);
  }
  throw new Error('Mathpix processing timed out');
}

// ---------------------------------------------------------------------------
// Claude: extract structured SAT questions from OCR markdown
// ---------------------------------------------------------------------------
async function extractSatQuestionsWithClaude(mmdText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var is required');

  const systemPrompt = `You are an expert at parsing SAT practice questions from OCR'd PDF content.

Each page of the PDF is one SAT question. The OCR text for all pages is concatenated with page breaks.

For each question, extract:
- The question ID
- The stimulus/passage (if any — reading comprehension questions have passages)
- The question stem (the actual question being asked)
- The answer options (A, B, C, D) with their content
- Whether it's MCQ (multiple choice) or SPR (student-produced response / fill-in-the-blank with no options)

QUESTION ID — CRITICAL:
- Every page has a question ID displayed near the top, typically in a dark banner/header area.
- The format is "ID: XXXXXXXX" where XXXXXXXX is a hex string (e.g., "ID: 9912e19f", "ID: e10d8313").
- Some pages may show it as just the hex string without "ID:" prefix.
- Some IDs may have a different format like "070925-DC" (alphanumeric with hyphens).
- You MUST extract this ID for every question. Look for it at the very beginning of each page's content.
- If the OCR text shows something like "ID: 9912e19f" or just "9912e19f" at the top of a page, that is the question_id.
- Do NOT return null for question_id unless the page truly has no identifiable ID anywhere.

IMPORTANT RULES:
- Each page is ONE question. Do not merge questions across pages.
- For math content, use \\( ... \\) for inline math and \\[ ... \\] for display math.
- Use clean HTML for all content: <p> for paragraphs, <em> for italics, <strong> for bold.
- For tables, use proper <table> HTML.
- Preserve em-dashes (—), en-dashes (–), and smart quotes.
- For images/figures that appear in the markdown as ![...](url), preserve them as <img src="url" alt="..." /> tags.
- Do NOT include the question ID or any page metadata in the stem or stimulus.
- If a question has a passage/stimulus, it appears before the question stem.
- SPR questions have no answer options — just a stem asking the student to type/write an answer.

Return a JSON array where each element has:
{
  "question_id": "<the ID found on the page — NEVER null if you can see any ID text>",
  "stimulus_html": "<passage/context HTML, or null if no stimulus>",
  "stem_html": "<the question text as HTML>",
  "question_type": "mcq" or "spr",
  "options": [
    { "label": "A", "content_html": "..." },
    { "label": "B", "content_html": "..." },
    { "label": "C", "content_html": "..." },
    { "label": "D", "content_html": "..." }
  ] // empty array for SPR questions
}

Return ONLY the JSON array. No markdown fencing, no explanation.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 64000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Here is the OCR'd content from a PDF containing SAT questions (one per page):\n\n${mmdText}` },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const text = (data.content || []).find(c => c.type === 'text')?.text || '';

  if (data.stop_reason === 'max_tokens') {
    throw new Error('Claude response was truncated. Try a smaller PDF (fewer pages).');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Claude did not return valid JSON.');
    parsed = JSON.parse(match[0]);
  }

  if (!Array.isArray(parsed)) throw new Error('Expected an array of questions');
  return parsed;
}
