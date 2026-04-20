import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../lib/supabase/server';

// POST /api/admin/batch-fix
// Accepts an image file, sends to Mathpix OCR, then Claude for extraction.
// Returns { external_id, version_id, stem_html, stimulus_html } for preview.
export async function POST(request) {
  const supabase = await createClient();
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
  const image = formData.get('image');
  if (!image) {
    return NextResponse.json({ error: 'image file is required' }, { status: 400 });
  }

  try {
    // Step 1: Send image to Mathpix for OCR
    const mmdText = await mathpixImageToMmd(image);

    // Step 2: Send OCR text to Claude to extract IDs + corrected HTML
    const result = await extractCorrectedQuestion(mmdText);

    // Step 3: Look up the question in the database to confirm it exists
    if (result.version_id) {
      const admin = createServiceClient();
      const { data: ver } = await admin
        .from('question_versions')
        .select('id, question_id, stem_html, stimulus_html')
        .eq('id', result.version_id)
        .maybeSingle();

      if (ver) {
        result.current_stem_html = ver.stem_html;
        result.current_stimulus_html = ver.stimulus_html;
        result.question_id = ver.question_id;
        result.found = true;
      } else {
        result.found = false;
      }
    } else if (result.external_id) {
      const admin = createServiceClient();
      const { data: q } = await admin
        .from('questions')
        .select('id, source_external_id')
        .eq('source_external_id', result.external_id)
        .maybeSingle();

      if (q) {
        result.question_id = q.id;
        const { data: ver } = await admin
          .from('question_versions')
          .select('id, stem_html, stimulus_html')
          .eq('question_id', q.id)
          .eq('is_current', true)
          .maybeSingle();
        if (ver) {
          result.version_id = ver.id;
          result.current_stem_html = ver.stem_html;
          result.current_stimulus_html = ver.stimulus_html;
          result.found = true;
        }
      } else {
        result.found = false;
      }
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error('batch-fix error:', e);
    return NextResponse.json({ error: e.message || 'Failed to process image' }, { status: 500 });
  }
}

// PUT /api/admin/batch-fix
// Saves corrected HTML to the question version
// Body: { version_id, stem_html, stimulus_html? }
export async function PUT(request) {
  const supabase = await createClient();
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

  const { version_id, stem_html, stimulus_html } = await request.json();
  if (!version_id || !stem_html) {
    return NextResponse.json({ error: 'version_id and stem_html are required' }, { status: 400 });
  }

  const admin = createServiceClient();
  const update = { stem_html };
  if (stimulus_html !== undefined) update.stimulus_html = stimulus_html;

  const { error } = await admin
    .from('question_versions')
    .update(update)
    .eq('id', version_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Mathpix: image → markdown
// ---------------------------------------------------------------------------
async function mathpixImageToMmd(file) {
  const appId = process.env.MATHPIX_APP_ID;
  const appKey = process.env.MATHPIX_APP_KEY;
  if (!appId || !appKey) throw new Error('MATHPIX_APP_ID and MATHPIX_APP_KEY env vars are required');

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString('base64');
  const mimeType = file.type || 'image/png';

  const res = await fetch('https://api.mathpix.com/v3/text', {
    method: 'POST',
    headers: {
      app_id: appId,
      app_key: appKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      src: `data:${mimeType};base64,${base64}`,
      formats: ['text', 'html'],
      math_inline_delimiters: ['\\(', '\\)'],
      math_display_delimiters: ['\\[', '\\]'],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mathpix OCR failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.text || data.html || '';
}

// ---------------------------------------------------------------------------
// Claude: extract IDs + corrected question HTML from OCR text
// ---------------------------------------------------------------------------
async function extractCorrectedQuestion(ocrText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var is required');

  const systemPrompt = `You are helping fix badly formatted SAT practice questions. You receive OCR text from a screenshot of a question rendered in a web app.

The screenshot contains:
1. ID labels at the top: "EID: <external_id>" and/or "VID: <version_id>" (a UUID)
2. The question content: possibly a stimulus/passage, then the question stem, then answer options A/B/C/D
3. UI elements (buttons, badges, navigation) that should be IGNORED

Your task:
1. Extract the external_id (EID) and version_id (VID) from the text
2. Extract and properly format the question's stem as clean HTML
3. If there's a stimulus/passage, extract it as clean HTML too
4. Preserve all math expressions using \\( ... \\) for inline and \\[ ... \\] for display math
5. Use proper HTML: <p> for paragraphs, <em> for italics, <strong> for bold, <table> for tables
6. Do NOT include the answer options — only the stem and stimulus
7. Do NOT include any UI elements, buttons, or navigation text
8. Preserve em-dashes (—), en-dashes (–), and smart quotes

Return a JSON object:
{
  "external_id": "<the EID value, or null if not found>",
  "version_id": "<the VID UUID, or null if not found>",
  "stem_html": "<properly formatted question stem HTML>",
  "stimulus_html": "<properly formatted stimulus HTML, or null if no stimulus>"
}

Return ONLY the JSON. No markdown fencing.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Here is the OCR text from a screenshot of a question:\n\n${ocrText}` },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const text = (data.content || []).find(c => c.type === 'text')?.text || '';

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Claude did not return valid JSON.');
    parsed = JSON.parse(match[0]);
  }

  return parsed;
}
