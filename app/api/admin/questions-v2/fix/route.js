import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../../lib/supabase/server';

// ============================================================
// /api/admin/questions-v2/fix
// ============================================================
// Admin-only endpoint for the "Fix with Claude" flow in the Questions
// V2 Preview tab.
//
//   POST   { id }
//     → loads the questions_v2 row, sends its stimulus / stem / MCQ
//       options to Claude Sonnet 4.6 with a system prompt encoding our
//       HTML-cleanup rules, and returns Claude's suggested rewrite
//       (NOT saved to the DB yet). Rationale is intentionally not
//       touched.
//
//   PUT    { id, stimulus_html, stem_html, options: [{label, content_html}] }
//     → saves the (admin-edited) suggestion back to questions_v2 and
//       stamps last_fixed_at / last_fixed_by.
//
// Mirrors the POST-suggest / PUT-save pattern already used in
// app/api/admin/batch-fix/route.js.

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin only' }, { status: 403 }) };
  }
  return { user };
}

// ------------------------------------------------------------
// POST — call Claude to get a suggested rewrite.
// ------------------------------------------------------------
export async function POST(request) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const id = body?.id;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const admin = createServiceClient();
  const { data: row, error: loadErr } = await admin
    .from('questions_v2')
    .select('id, question_type, stimulus_html, stem_html, options, display_code')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'question not found' }, { status: 404 });

  try {
    const suggestion = await askClaudeToRewrite(row);
    return NextResponse.json({ ok: true, suggestion });
  } catch (e) {
    console.error('questions-v2/fix POST error:', e);
    return NextResponse.json({ error: e.message || 'Claude request failed' }, { status: 500 });
  }
}

// ------------------------------------------------------------
// PUT — save an (edited) suggestion to questions_v2.
// ------------------------------------------------------------
export async function PUT(request) {
  const { user, error: authError } = await requireAdmin();
  if (authError) return authError;

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { id, stimulus_html, stem_html, options } = body || {};
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const admin = createServiceClient();

  // Load the existing row so we can merge (we only update the fields
  // that were sent and preserve the rest, especially ordinal on each
  // option — the UI only edits label + content_html).
  const { data: existing, error: loadErr } = await admin
    .from('questions_v2')
    .select('id, options')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'question not found' }, { status: 404 });

  const update = {
    last_fixed_at: new Date().toISOString(),
    last_fixed_by: user.id,
  };

  if (typeof stimulus_html === 'string') update.stimulus_html = stimulus_html;
  if (typeof stem_html === 'string') update.stem_html = stem_html;

  if (Array.isArray(options)) {
    // Merge content_html/label from the client onto the existing
    // options (keyed by label), preserving ordinal so the order in
    // the UI stays stable.
    const existingOptions = Array.isArray(existing.options) ? existing.options : [];
    const byLabel = new Map(existingOptions.map(o => [String(o.label), o]));
    const merged = options
      .filter(o => o && typeof o.content_html === 'string')
      .map((o, i) => {
        const prior = byLabel.get(String(o.label)) || {};
        return {
          label: o.label ?? prior.label ?? String.fromCharCode(65 + i),
          ordinal: prior.ordinal ?? i,
          content_html: o.content_html,
        };
      })
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
    update.options = merged;
  }

  const { error: updErr } = await admin
    .from('questions_v2')
    .update(update)
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, last_fixed_at: update.last_fixed_at });
}

// ------------------------------------------------------------
// Claude call
// ------------------------------------------------------------
const SYSTEM_PROMPT = `You are rewriting SAT practice questions stored as messy HTML so they render cleanly with simple HTML and MathJax.

You will receive a JSON object describing ONE question:
{
  "question_type": "mcq" | "spr",
  "stimulus_html": <string or null>,
  "stem_html":     <string>,
  "options":       [{ "label": "A", "content_html": "..." }, ...]   // may be empty for SPR
}

You MUST respond by calling the \`return_fixed_question\` tool exactly once with the cleaned-up fields. Do NOT emit any free-form text — all output goes through the tool call. Do NOT change the meaning, wording, or numerical values of the question — only the formatting.

## Global rules

- Preserve all text content exactly. Only fix formatting.
- Decode HTML entities to real characters:  \`&rsquo;\` → \`'\`,  \`&lsquo;\` → \`'\`,  \`&ldquo;\` → \`"\`,  \`&rdquo;\` → \`"\`,  \`&mdash;\` → \`—\`,  \`&ndash;\` → \`–\`,  \`&nbsp;\` → regular space,  \`&deg;\` → \`°\`,  \`&amp;\` → \`&\`.
- Literal US dollar amounts in prose MUST be escaped as \`\\$9.25\` (not \`$9.25\`) so MathJax does not treat the \`$\` as a math delimiter.
- Wrap every variable, expression, or numeric answer that appears inside running prose in \`\\( ... \\)\`. Single-letter variables that used to be \`<span class="italic">x</span>\` or \`<em>x</em>\` become \`\\(x\\)\`.
- NEVER use Unicode math characters like \`×\`, \`÷\`, \`≤\`, \`≥\`, \`≠\`, \`π\`, \`θ\`, \`∑\`, \`√\`, \`∞\` directly. Always wrap them in LaTeX: \`\\(\\times\\)\`, \`\\(\\div\\)\`, \`\\(\\leq\\)\`, \`\\(\\geq\\)\`, \`\\(\\neq\\)\`, \`\\(\\pi\\)\`, \`\\(\\theta\\)\`, \`\\(\\sum\\)\`, \`\\(\\sqrt{\\cdot}\\)\`, \`\\(\\infty\\)\`.
- Degree symbol: if it is adjacent to a numeral, pull the numeral INTO math mode with it — e.g. \`81°F\` becomes \`\\(81^\\circ\\text{F}\\)\`. If it stands alone in prose like "in degrees Fahrenheit (°F)", render as \`(\\(^\\circ\\)F)\`.
- PRESERVE implied multiplication. Do NOT insert \`\\times\`, \`\\cdot\`, \`×\`, or \`*\` where the source expression used juxtaposition. A coefficient next to a variable, a variable next to another variable, or a fraction next to a variable renders as-is with only a space between tokens:
  - \`(25/4)m = 95\` → \`\\(\\frac{25}{4} m = 95\\)\`  (NOT \`\\frac{25}{4} \\times m\`)
  - \`2x\` → \`\\(2x\\)\`,  \`3xy\` → \`\\(3xy\\)\`,  \`-4ab^2\` → \`\\(-4ab^2\\)\`
  - \`2(x+1)\` → \`\\(2(x+1)\\)\`  (NOT \`\\(2 \\times (x+1)\\)\`)
  Only emit \`\\times\` or \`\\cdot\` if the source ACTUALLY contains an explicit multiplication symbol (\`×\`, \`*\`, or alt text that literally says "times" / "multiplied by" between two numeric factors like \`3 times 5\`).

## Image → LaTeX

Many input fields contain \`<img>\` tags whose equation is rendered as a PNG but whose \`alt\` attribute describes the equation in words, e.g.:

    alt="f of x equals, 9 point 2 5, minus 0 point 5 0 x"

Convert the alt text to LaTeX using common-sense mapping:

- "point" → \`.\`,  "plus" → \`+\`,  "minus" → \`-\`,  "equals" → \`=\`,  "times" → \`\\cdot\` or \`\\times\`
- "f of x" → \`f(x)\`,  "g of x" → \`g(x)\`
- digit words like "9 point 2 5" → \`9.25\`
- "the square root of …" → \`\\sqrt{…}\`
- "x squared" → \`x^2\`,  "x cubed" → \`x^3\`,  "x to the n" → \`x^n\`
- "fraction a over b" → \`\\frac{a}{b}\`

If an \`<img>\` has no usable \`alt\` text, replace it with the literal string \`<!-- TODO: unreadable image -->\`.

## Classes and wrapping HTML to KEEP

Keep these semantic classes (add them if missing):

- A single top-level \`<p class="stem_paragraph">\` around the stem.
- \`<p class="stimulus_paragraph">\` around each paragraph of the stimulus.
- \`<table class="stimulus_table">\` for any table that lives in the stimulus.

Drop every other class, including:
\`passage\`, \`passage_para\`, \`prose\`, \`style:1\`, \`choice_paragraph\`, \`math_expression\`, \`math-container\`, \`italic\`, \`table_wrapper\`, \`table_WithBorder\`, \`tbody\`, \`row\`, \`entry\`, \`align:center\`, \`align:left\`, \`colname:col*\`, any \`tcp-<uuid>\` class, \`stimulus_reference\`, etc.

Also strip wrapping \`<div>\`s that exist only to carry a class (unwrap their children).

## Tables

- Flatten nested tables. If an input table contains exactly one \`<td>\` whose only child is another \`<table>\`, drop the outer wrapper and keep only the inner table.
- Output a simple structure: \`<table class="stimulus_table"><tr><th>…</th>…</tr><tr><td>…</td>…</tr>…</table>\`.
- If the first row looks like labels (e.g. "Day", "1", "2", …), use \`<th>\` for every cell in that row; otherwise use \`<td>\` everywhere.
- Do NOT output \`<thead>\`, \`<tbody>\`, or any \`class\`/\`style\`/\`align\` attributes on rows or cells.
- Cell contents follow the same math rules as running prose.

## Options

Return each option as the SHORTEST string that renders correctly:

- A math-only option becomes a bare \`\\( ... \\)\` expression (no \`<p>\` wrapper). Example: \`\\( f(x) = 9.25 - 0.50x \\)\`.
- A bare numeric answer — even a single integer, decimal, fraction, or signed number — MUST also be wrapped in \`\\( ... \\)\`. Examples: \`42\` → \`\\(42\\)\`, \`-3.14\` → \`\\(-3.14\\)\`, \`1/2\` → \`\\(\\frac{1}{2}\\)\`, \`$9.25\` → \`\\(\\$9.25\\)\`.
- A prose-only option stays as bare text. Example: \`Median of the high temperatures\`.
- A mixed option stays as plain text with inline \`\\( ... \\)\` where appropriate.
- Never wrap an option's \`content_html\` in \`<p>\`, \`<span>\`, or any class.
- Preserve the input \`label\` value exactly.

## Stimulus and stem

- \`stimulus_html\`: one or more \`<p class="stimulus_paragraph">\` blocks, optionally followed by a \`<table class="stimulus_table">\`. If the input stimulus is empty/null, return \`null\`.
- If the ENTIRE stimulus is a standalone equation or mathematical expression (no surrounding prose — e.g. just \`\\(x^2 - x - 1 = 0\\)\`), put it inside \`<p class="stimulus_paragraph" align="Center">...</p>\` so it renders centered. Keep the \`align="Center"\` attribute exactly as shown, with capital C. Do NOT add \`align="Center"\` to stimulus paragraphs that contain prose around the equation.
- \`stem_html\`: exactly one \`<p class="stem_paragraph">\` wrapping the question sentence.

## Examples

The examples below are in a labelled field format, not JSON. Inside the tool call, each field's string value should contain the exact characters shown after the "→" arrow (e.g. a single backslash before "(", a single backslash before ")").

── Example 1 ──────────────────────────────────────────────
INPUT
  question_type: mcq
  stimulus_html: (null)
  stem_html: <p class="stem_paragraph ">On January 1, 2015, a city&rsquo;s minimum hourly wage was $9.25. It will increase by $0.50 on the first day of the year for the next 5 years. Which of the following functions best models the minimum hourly wage, in dollars, <span class="italic">x</span> years after January 1, 2015, where <img alt="x equals the following five values: 1, 2, 3, 4, 5"> ?</p>
  option A: <p class="choice_paragraph "><img alt="f of x equals, 9 point 2 5, minus 0 point 5 0 x"></p>
  option B: <p class="choice_paragraph "><img alt="f of x equals, 9 point 2 5 x, minus 0 point 5 0"></p>
  option C: <p class="choice_paragraph "><img alt="f of x equals, 9 point 2 5, plus 0 point 5 0 x"></p>
  option D: <p class="choice_paragraph "><img alt="f of x equals, 9 point 2 5 x, plus 0 point 5 0"></p>

OUTPUT  (tool call arguments)
  stimulus_html → null
  stem_html     → <p class="stem_paragraph">On January 1, 2015, a city's minimum hourly wage was \\$9.25. It will increase by \\$0.50 on the first day of the year for the next 5 years. Which of the following functions best models the minimum hourly wage, in dollars, \\(x\\) years after January 1, 2015, where \\(x = 1, 2, 3, 4, 5\\)?</p>
  option A → \\( f(x) = 9.25 - 0.50x \\)
  option B → \\( f(x) = 9.25x - 0.50 \\)
  option C → \\( f(x) = 9.25 + 0.50x \\)
  option D → \\( f(x) = 9.25x + 0.50 \\)

── Example 2 ──────────────────────────────────────────────
INPUT
  question_type: mcq
  stimulus_html: <div class="stimulus_reference "><div class="passage "><div class="prose style:1 "><p class="passage_para ">The high temperature, in degrees Fahrenheit (&deg;F), in a certain city was recorded for each of 5&nbsp;days. The data are shown below.</p><div class="table_wrapper "><table class="tcp-abc"><tbody><tr><td><table class="table_WithBorder tcp-def"><tbody class="tbody "><tr class="row "><td class="entry align:left colname:col1 ">Day</td><td class="entry align:center colname:col2 ">1</td><td class="entry align:center colname:col3 ">2</td><td class="entry align:center colname:col4 ">3</td><td class="entry align:center colname:col5 ">4</td><td class="entry align:center colname:col6 ">5</td></tr><tr class="row "><td class="entry colname:col1 ">High temperature (&deg;F)</td><td class="entry align:center colname:col2 ">81</td><td class="entry align:center colname:col3 ">80</td><td class="entry align:center colname:col4 ">81</td><td class="entry align:center colname:col5 ">81</td><td class="entry align:center colname:col6 ">82</td></tr></tbody></table></td></tr></tbody></table></div></div></div></div>
  stem_html:     <p class="stem_paragraph ">Over this 5-day period, which of the following is NOT equal to 81&deg;F?</p>
  option A: <p>Median of the high temperatures</p>
  option B: <p>Mean of the high temperatures</p>
  option C: <p>Mode of the high temperatures</p>
  option D: <p>Range of the high temperatures</p>

OUTPUT  (tool call arguments)
  stimulus_html → <p class="stimulus_paragraph">The high temperature, in degrees Fahrenheit (\\(^\\circ\\)F), in a certain city was recorded for each of 5 days. The data are shown below.</p><table class="stimulus_table"><tr><th>Day</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr><tr><td>High temperature (\\(^\\circ\\)F)</td><td>81</td><td>80</td><td>81</td><td>81</td><td>82</td></tr></table>
  stem_html     → <p class="stem_paragraph">Over this 5-day period, which of the following is NOT equal to \\(81^\\circ\\text{F}\\)?</p>
  option A → Median of the high temperatures
  option B → Mean of the high temperatures
  option C → Mode of the high temperatures
  option D → Range of the high temperatures

── Example 3 (standalone equation stimulus + numeric answers) ─────
INPUT
  question_type: mcq
  stimulus_html: <p><img alt="x squared minus x minus 1 equals 0"></p>
  stem_html:     <p class="stem_paragraph ">What values satisfy the equation above?</p>
  option A: <p>-1</p>
  option B: <p>0</p>
  option C: <p>1</p>
  option D: <p>2</p>

OUTPUT  (tool call arguments)
  stimulus_html → <p class="stimulus_paragraph" align="Center">\\(x^2 - x - 1 = 0\\)</p>
  stem_html     → <p class="stem_paragraph">What values satisfy the equation above?</p>
  option A → \\(-1\\)
  option B → \\(0\\)
  option C → \\(1\\)
  option D → \\(2\\)

Always respond by invoking return_fixed_question. Never emit free-form text.`;

// Schema for the tool Claude must call. Using tool_use (not free-form
// JSON in a text block) is critical: LaTeX backslashes round-trip
// cleanly because the API properly escapes them in transit, so things
// like \( \frac{1}{2} \) arrive as a single-backslash string instead
// of breaking JSON.parse with "Bad escaped character".
const RETURN_FIXED_QUESTION_TOOL = {
  name: 'return_fixed_question',
  description:
    'Return the cleaned-up HTML fields for the question. Call this tool exactly once. Every string may contain single-backslash LaTeX such as \\( x \\).',
  input_schema: {
    type: 'object',
    properties: {
      stimulus_html: {
        type: ['string', 'null'],
        description:
          'Cleaned stimulus HTML, or null if the original stimulus was empty/null.',
      },
      stem_html: {
        type: 'string',
        description:
          'Cleaned stem HTML. Always wrapped in <p class="stem_paragraph">...</p>.',
      },
      options: {
        type: 'array',
        description:
          'One entry per MCQ option, in the same order as the input. Empty array for SPR questions.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'A / B / C / D (preserve the input label).' },
            content_html: {
              type: 'string',
              description:
                'Cleaned option content — bare LaTeX or bare text, not wrapped in any HTML tag.',
            },
          },
          required: ['label', 'content_html'],
        },
      },
    },
    required: ['stem_html', 'options'],
  },
};

async function askClaudeToRewrite(row) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var is required');

  // Only forward label + content_html to Claude — no internal ids,
  // ordinals, or taxonomy — to keep the payload small.
  const options = Array.isArray(row.options)
    ? row.options
        .slice()
        .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
        .map(o => ({ label: o.label, content_html: o.content_html || '' }))
    : [];

  const userPayload = {
    question_type: row.question_type,
    stimulus_html: row.stimulus_html || null,
    stem_html: row.stem_html || '',
    options,
  };

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    tools: [RETURN_FIXED_QUESTION_TOOL],
    tool_choice: { type: 'tool', name: 'return_fixed_question' },
    messages: [
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
  });

  const data = await fetchClaudeWithRetry(apiKey, requestBody);
  const toolUse = (data.content || []).find(
    c => c.type === 'tool_use' && c.name === 'return_fixed_question'
  );
  if (!toolUse) {
    throw new Error('Claude did not call return_fixed_question.');
  }

  // toolUse.input is already a parsed object — no JSON.parse of
  // free-form text, no backslash escaping headaches.
  const parsed = toolUse.input || {};

  // Minimal validation: stem_html must exist, options must be an array
  // if present. Anything missing falls back to the original row so the
  // admin can still review + edit.
  return {
    stimulus_html:
      typeof parsed.stimulus_html === 'string' || parsed.stimulus_html === null
        ? parsed.stimulus_html
        : row.stimulus_html || null,
    stem_html: typeof parsed.stem_html === 'string' ? parsed.stem_html : row.stem_html || '',
    options: Array.isArray(parsed.options)
      ? parsed.options.map((o, i) => ({
          label: o?.label ?? options[i]?.label ?? String.fromCharCode(65 + i),
          content_html: typeof o?.content_html === 'string' ? o.content_html : '',
        }))
      : options,
  };
}

// POSTs to the Anthropic messages endpoint with retry + backoff for
// transient failures. Returns the parsed response body on success.
//
// Retry policy:
//   - Up to 4 attempts total
//   - Retries on HTTP 529 (overloaded_error), 503 (service_unavailable),
//     408 (request_timeout), and network errors (fetch throws)
//   - Backoff: 1s, 2s, 4s between attempts, each with ±250 ms of jitter
//   - All other HTTP errors (400, 401, 403, 404, 429 real rate limits)
//     fail fast on the first attempt
async function fetchClaudeWithRetry(apiKey, requestBody) {
  const MAX_ATTEMPTS = 4;
  const RETRYABLE_STATUSES = new Set([408, 503, 529]);

  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: requestBody,
      });
    } catch (networkErr) {
      // Fetch itself threw (DNS failure, connection reset, etc.) —
      // always retry these.
      lastError = new Error(`Claude API network error: ${networkErr.message || networkErr}`);
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError;
    }

    if (res.ok) {
      return await res.json();
    }

    const errText = await res.text();
    if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
      lastError = new Error(`Claude API error (${res.status}): ${errText}`);
      await sleep(backoffMs(attempt));
      continue;
    }

    // Non-retryable (or final) failure.
    throw new Error(`Claude API error (${res.status}): ${errText}`);
  }

  // Should be unreachable, but keep the compiler / future-you happy.
  throw lastError || new Error('Claude API request failed after retries');
}

function backoffMs(attempt) {
  // attempt 0 → ~1s, 1 → ~2s, 2 → ~4s, with ±250 ms jitter
  const base = 1000 * Math.pow(2, attempt);
  const jitter = Math.floor((Math.random() - 0.5) * 500);
  return Math.max(250, base + jitter);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
