import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../lib/supabase/server';

// POST /api/act/questions/parse-pdf
// Accepts two PDF files (questions + answer key), sends to Mathpix, then Claude
// Returns structured question array ready for review.
export async function POST(request) {
  const userId = request.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'manager')) {
    return NextResponse.json({ error: 'Only admins and managers can import questions' }, { status: 403 });
  }

  const formData = await request.formData();
  const questionsPdf = formData.get('questions_pdf');
  const answersPdf = formData.get('answers_pdf');
  const sourceTest = formData.get('source_test') || '';
  const section = formData.get('section') || 'math'; // math | english

  if (!questionsPdf || !answersPdf) {
    return NextResponse.json({ error: 'Both questions_pdf and answers_pdf files are required' }, { status: 400 });
  }

  // Sanitize source_test for use as a directory name
  const dirName = sourceTest
    ? sourceTest.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').toLowerCase()
    : `import_${Date.now()}`;

  try {
    // Step 1: Send both PDFs to Mathpix for OCR
    const [questionsResult, answersResult] = await Promise.all([
      mathpixPdfToMmd(questionsPdf),
      mathpixPdfToMmd(answersPdf),
    ]);

    // Step 2: Download all images from Mathpix CDN and upload to Supabase Storage
    const questionsMmdLocal = await downloadAndRewriteImages(admin, questionsResult, dirName, 'q');
    const answersMmdLocal = await downloadAndRewriteImages(admin, answersResult, dirName, 'a');

    // Step 3: Send both OCR results to Claude for structured extraction
    const extractFn = section === 'english' ? extractEnglishWithClaude : extractQuestionsWithClaude;
    const questions = await extractFn(
      questionsMmdLocal,
      answersMmdLocal,
      sourceTest,
    );

    return NextResponse.json({ ok: true, questions });
  } catch (e) {
    console.error('parse-pdf error:', e);
    return NextResponse.json({ error: e.message || 'Failed to parse PDFs' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Download images from Mathpix CDN and upload to Supabase Storage
// ---------------------------------------------------------------------------
const IMAGE_BUCKET = 'images';

async function downloadAndRewriteImages(supabase, mmdText, dirName, prefix) {
  // Match both markdown images ![...](url) and HTML <img src="url">
  const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const htmlImageRegex = /<img\s[^>]*src=["']([^"']+)["'][^>]*>/gi;

  // Collect all image URLs
  const imageUrls = new Map(); // url -> local filename
  let counter = 0;

  let match;
  while ((match = mdImageRegex.exec(mmdText)) !== null) {
    const url = match[2];
    if (!imageUrls.has(url)) {
      counter++;
      const ext = guessExtension(url);
      imageUrls.set(url, `${prefix}_${String(counter).padStart(3, '0')}${ext}`);
    }
  }
  while ((match = htmlImageRegex.exec(mmdText)) !== null) {
    const url = match[1];
    if (!imageUrls.has(url)) {
      counter++;
      const ext = guessExtension(url);
      imageUrls.set(url, `${prefix}_${String(counter).padStart(3, '0')}${ext}`);
    }
  }

  if (imageUrls.size === 0) return mmdText;

  // Download and upload all images in parallel
  const downloads = [];
  for (const [url, filename] of imageUrls) {
    const storagePath = `${dirName}/${filename}`;
    downloads.push(
      downloadAndUploadImage(supabase, url, storagePath)
        .then((publicUrl) => ({ url, publicUrl, ok: true }))
        .catch((err) => {
          console.warn(`Failed to download/upload image ${url}:`, err.message);
          return { url, publicUrl: null, ok: false };
        })
    );
  }
  const results = await Promise.all(downloads);

  // Build URL -> public URL map (only for successful uploads)
  const urlToPublic = new Map();
  for (const r of results) {
    if (r.ok) {
      urlToPublic.set(r.url, r.publicUrl);
    }
  }

  // Rewrite markdown image references
  let rewritten = mmdText.replace(mdImageRegex, (full, alt, url) => {
    const pub = urlToPublic.get(url);
    if (pub) return `![${alt}](${pub})`;
    return full;
  });

  // Rewrite HTML image references
  rewritten = rewritten.replace(htmlImageRegex, (full, url) => {
    const pub = urlToPublic.get(url);
    if (pub) return full.replace(url, pub);
    return full;
  });

  return rewritten;
}

function guessExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.svg')) return '.svg';
    if (pathname.endsWith('.png')) return '.png';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return '.jpg';
    if (pathname.endsWith('.gif')) return '.gif';
    if (pathname.endsWith('.webp')) return '.webp';
  } catch {}
  return '.png'; // default to png
}

const CONTENT_TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

async function downloadAndUploadImage(supabase, url, storagePath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = res.headers.get('content-type') || '';
  const buffer = Buffer.from(await res.arrayBuffer());

  // If we got SVG content, fix the storage path extension
  if (contentType.includes('svg') && !storagePath.endsWith('.svg')) {
    storagePath = storagePath.replace(/\.[^.]+$/, '.svg');
  }

  const ext = storagePath.match(/\.[^.]+$/)?.[0] || '.png';
  const mime = CONTENT_TYPES[ext] || 'application/octet-stream';

  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: true });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Mathpix: convert a PDF file to Mathpix Markdown (mmd)
// ---------------------------------------------------------------------------
async function mathpixPdfToMmd(file) {
  const appId = process.env.MATHPIX_APP_ID;
  const appKey = process.env.MATHPIX_APP_KEY;
  if (!appId || !appKey) throw new Error('MATHPIX_APP_ID and MATHPIX_APP_KEY env vars are required');

  const bytes = await file.arrayBuffer();
  const blob = new Blob([bytes], { type: 'application/pdf' });

  // Upload the PDF to Mathpix
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

  // Poll for completion
  const maxWait = 120_000; // 2 minutes
  const pollInterval = 3_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));

    const statusRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}`, {
      headers: { app_id: appId, app_key: appKey },
    });
    if (!statusRes.ok) continue;

    const status = await statusRes.json();
    if (status.status === 'completed') {
      // Fetch the markdown output
      const mdRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdf_id}.md`, {
        headers: { app_id: appId, app_key: appKey },
      });
      if (!mdRes.ok) throw new Error('Failed to fetch Mathpix markdown output');
      return await mdRes.text();
    }
    if (status.status === 'error') {
      throw new Error(`Mathpix processing error: ${status.error || 'unknown'}`);
    }
  }

  throw new Error('Mathpix processing timed out');
}

// ---------------------------------------------------------------------------
// Claude: extract structured questions from the two OCR outputs
// ---------------------------------------------------------------------------
async function extractQuestionsWithClaude(questionsMmd, answersMmd, sourceTest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var is required');

  const systemPrompt = `You are an expert at parsing ACT math test content that has been OCR'd from PDF.

You will receive two documents:
1. QUESTIONS DOCUMENT: Contains the math questions with their question numbers, stems, any diagrams/figures, and answer options.
2. ANSWER KEY DOCUMENT: Contains the correct answers AND taxonomy information (category, subcategory, etc.) for each question.

Your task is to extract each question into a structured JSON object.

IMPORTANT RULES:
- Questions are numbered sequentially (1, 2, 3, ...).
- The answer key uses a letter (A-E or F-K) to indicate the correct answer for each question.
- Older ACT math sections alternate between A-E and F-K option label sets (odd questions use A-E, even use F-K). You MUST normalize all labels to A-B-C-D-E regardless.
  - F→A, G→B, H→C, J→D, K→E
- Some questions may have 5 options. We will handle reducing to 4 later — include all options you find.
- Track the correct answer letter carefully. After normalizing F-K to A-E, the correct answer letter must correspond to the correct option content.

ACT MATH CATEGORY HIERARCHY — YOU MUST USE THESE EXACT CATEGORIES:
The ACT math section has exactly TWO top-level categories plus a cross-cutting flag:
1. "Preparing for Higher Math" (category_code: "PHM") — with subcategories:
   - "Number & Quantity" (subcategory_code: "NQ")
   - "Algebra" (subcategory_code: "ALG")
   - "Functions" (subcategory_code: "FUN")
   - "Geometry" (subcategory_code: "GEO")
   - "Statistics & Probability" (subcategory_code: "SP")
2. "Integrating Essential Skills" (category_code: "IES") — NO subcategories
3. "Modeling" is NOT a category. It is a cross-cutting flag (is_modeling: true/false) that applies to questions in EITHER category.

CRITICAL: If the answer key shows a question's category as "Algebra", "Functions", "Geometry", "Number & Quantity", or "Statistics & Probability", those are SUBCATEGORIES. The category for all of them is "Preparing for Higher Math". Do NOT put subcategory names in the category field.

IMAGES / DIAGRAMS:
- The markdown contains images as ![alt](url) or <img src="url"> with URLs (either local paths or full URLs).
- PRESERVE the image references exactly as they appear.
- When an image belongs to a question stem (typically appears below the question text, before the answer options), include it in stem_html as an <img> tag.
- When an image belongs to an answer option, include it in that option's content_html.
- When an image is a shared stimulus/passage (e.g. a graph referenced by multiple questions), include it in stimulus_html.
- Convert markdown image syntax ![alt](path) to HTML: <img src="path" alt="alt" />

MATH AND HTML:
- Wrap all math expressions in \\( ... \\) for inline or \\[ ... \\] for display.
- Use HTML for all content fields (stem_html, option content_html, rationale_html, stimulus_html).
- For difficulty: use the question's ordinal position mapped to difficulty 1-5 with even distribution across the total number of questions. For example, with 60 questions: 1-12→1, 13-24→2, 25-36→3, 37-48→4, 49-60→5.

Return a JSON array (no wrapping object, just the array) where each element has:
{
  "source_ordinal": <number>,
  "section": "math",
  "category_code": "<PHM or IES>",
  "category": "<Preparing for Higher Math or Integrating Essential Skills>",
  "subcategory_code": "<NQ, ALG, FUN, GEO, SP, or empty string>",
  "subcategory": "<full subcategory name, or empty string if IES>",
  "difficulty": <1-5>,
  "is_modeling": <boolean, from answer key if indicated>,
  "stimulus_html": "<any passage/context, or empty string>",
  "stem_html": "<the question text in HTML>",
  "rationale_html": "<explanation from answer key if available, or empty string>",
  "options": [
    { "ordinal": 1, "label": "A", "content_html": "...", "is_correct": <boolean> },
    { "ordinal": 2, "label": "B", "content_html": "...", "is_correct": <boolean> },
    { "ordinal": 3, "label": "C", "content_html": "...", "is_correct": <boolean> },
    { "ordinal": 4, "label": "D", "content_html": "...", "is_correct": <boolean> },
    { "ordinal": 5, "label": "E", "content_html": "...", "is_correct": <boolean> }
  ]
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
        {
          role: 'user',
          content: `## QUESTIONS DOCUMENT\n\n${questionsMmd}\n\n---\n\n## ANSWER KEY DOCUMENT\n\n${answersMmd}\n\nSource test identifier: "${sourceTest}"`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const text = (data.content || []).find(c => c.type === 'text')?.text || '';

  // Check if the response was truncated
  if (data.stop_reason === 'max_tokens') {
    throw new Error('Claude response was truncated (hit max_tokens). The PDF may be too large — try splitting into smaller sections.');
  }

  // Parse the JSON from Claude's response
  let parsed;
  try {
    // Try direct parse first
    parsed = JSON.parse(text);
  } catch {
    // Try extracting JSON array from the response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Claude did not return valid JSON. Raw response saved for debugging.');
    parsed = JSON.parse(match[0]);
  }

  if (!Array.isArray(parsed)) throw new Error('Expected an array of questions from Claude');

  // Post-process: reduce 5 options to 4 where needed, add source_test
  return parsed.map((q) => {
    q.source_test = sourceTest;

    if (q.options && q.options.length === 5) {
      const correctIdx = q.options.findIndex(o => o.is_correct);

      if (correctIdx === -1) {
        // No correct answer marked — just drop the last option
        q.options = q.options.slice(0, 4);
      } else if (correctIdx === 4) {
        // Correct answer is E — remove option A (index 0) instead
        q.options = q.options.slice(1);
        // Re-label A-D
        q.options.forEach((o, i) => {
          o.ordinal = i + 1;
          o.label = String.fromCharCode(65 + i); // A, B, C, D
        });
      } else {
        // Correct answer is A-D — remove option E (index 4)
        q.options = q.options.slice(0, 4);
      }
    }

    // Ensure ordinals and labels are clean
    if (q.options) {
      q.options.forEach((o, i) => {
        o.ordinal = i + 1;
        o.label = String.fromCharCode(65 + i);
      });
    }

    return q;
  });
}

// ---------------------------------------------------------------------------
// Claude: extract structured ENGLISH questions from OCR'd passages
// ---------------------------------------------------------------------------
async function extractEnglishWithClaude(questionsMmd, answersMmd, sourceTest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var is required');

  const systemPrompt = `You are an expert at parsing ACT English test content that has been OCR'd from PDF.

You will receive two documents:
1. QUESTIONS DOCUMENT: Contains passages with numbered underlined segments and answer choices alongside or below the passage.
2. ANSWER KEY DOCUMENT: Contains the correct answers AND taxonomy information for each question.

ACT ENGLISH FORMAT:
- The English section has 5 passages, each with ~15 questions (75 total).
- Each passage is a prose text with numbered underlined segments. Each underline corresponds to a question.
- Questions appear alongside the passage. Some questions ask about a specific underlined segment (replacement/grammar), others ask about the passage as a whole (rhetorical/organization).
- Answer labels alternate between A-D (odd questions) and F-J (even questions). Normalize ALL to A-B-C-D:
  - F→A, G→B, H→C, J→D

PASSAGE EXTRACTION:
For each passage, reconstruct the FULL passage text as HTML. This will be stored in stimulus_html and shared by all questions in that passage.

CRITICAL — UNDERLINE MARKUP:
- Each numbered underlined segment in the passage must be wrapped with: <span data-ref="N" class="passage-ref"><u>underlined text</u></span>
  where N is the question number.
- Paragraph numbers like [1], [2], [3] in the passage should be preserved as paragraph markers.
- Insertion points marked [A], [B], [C], [D] should be preserved as-is in the passage.
- Italicized words should use <em> tags.
- The passage title should be wrapped in <strong> tags.

QUESTION EXTRACTION:
For each question:
- "source_ordinal": the question number (1-75)
- "section": "english"
- "highlight_ref": the underline number this question refers to (same as source_ordinal for most questions). For questions about the passage as a whole (e.g., "Which of the following would best conclude this paragraph?"), set highlight_ref to null.
- "stem_html": The question text. For simple replacement questions where the student just picks the best wording, use an empty string. For questions with an explicit prompt (e.g., "Which choice best supports..."), include the full question text.
- "stimulus_html": The FULL passage HTML (same for every question in the passage).
- "options": Array of 4 options. The first option is typically "NO CHANGE" for replacement questions.

ACT ENGLISH CATEGORY HIERARCHY:
1. "Production of Writing" (category_code: "POW") — subcategories:
   - "Topic Development" (subcategory_code: "TD")
   - "Organization, Unity, and Cohesion" (subcategory_code: "OUC")
2. "Knowledge of Language" (category_code: "KOL") — subcategories:
   - "Precision" (subcategory_code: "PR")
   - "Concision" (subcategory_code: "CON")
   - "Style and Tone" (subcategory_code: "ST")
3. "Conventions of Standard English" (category_code: "CSE") — subcategories:
   - "Sentence Structure and Formation" (subcategory_code: "SSF")
   - "Punctuation" (subcategory_code: "PUN")
   - "Usage" (subcategory_code: "USG")

Map the answer key's taxonomy to the above. If the answer key uses different names, map to the closest match.

DIFFICULTY:
- Map question ordinal position within the entire section to difficulty 1-5 with even distribution.
- For 75 questions: 1-15→1, 16-30→2, 31-45→3, 46-60→4, 61-75→5.

Return a JSON array where each element has:
{
  "source_ordinal": <number>,
  "section": "english",
  "highlight_ref": <number or null>,
  "category_code": "<POW, KOL, or CSE>",
  "category": "<full category name>",
  "subcategory_code": "<from answer key>",
  "subcategory": "<full subcategory name>",
  "difficulty": <1-5>,
  "is_modeling": false,
  "stimulus_html": "<FULL passage HTML with <span data-ref> underline markup>",
  "stem_html": "<question text, or empty string for simple replacement>",
  "rationale_html": "<explanation from answer key if available, or empty string>",
  "options": [
    { "ordinal": 1, "label": "A", "content_html": "...", "is_correct": <boolean> },
    { "ordinal": 2, "label": "B", "content_html": "...", "is_correct": <boolean> },
    { "ordinal": 3, "label": "C", "content_html": "...", "is_correct": <boolean> },
    { "ordinal": 4, "label": "D", "content_html": "...", "is_correct": <boolean> }
  ]
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
        {
          role: 'user',
          content: `## QUESTIONS DOCUMENT\n\n${questionsMmd}\n\n---\n\n## ANSWER KEY DOCUMENT\n\n${answersMmd}\n\nSource test identifier: "${sourceTest}"`,
        },
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
    throw new Error('Claude response was truncated (hit max_tokens). Try importing one passage at a time for English sections.');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Claude did not return valid JSON.');
    parsed = JSON.parse(match[0]);
  }

  if (!Array.isArray(parsed)) throw new Error('Expected an array of questions from Claude');

  // Post-process: normalize labels, add source_test
  return parsed.map((q) => {
    q.source_test = sourceTest;
    q.section = 'english';

    // English always has 4 options, but normalize labels just in case
    if (q.options) {
      q.options.forEach((o, i) => {
        o.ordinal = i + 1;
        o.label = String.fromCharCode(65 + i); // A, B, C, D
      });
    }

    return q;
  });
}
