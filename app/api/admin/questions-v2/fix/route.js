import { NextResponse } from 'next/server';
import { requireServiceRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';
import { isAlreadyClean, isMathQuestion, pickModel } from '../../../../../lib/questionsV2Hygiene';
import {
  SYSTEM_PROMPT,
  RETURN_FIXED_QUESTION_TOOL,
} from '../../../../../lib/questionsV2FixPrompt';

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

// ------------------------------------------------------------
// POST — call Claude to get a suggested rewrite.
// ------------------------------------------------------------
export const POST = legacyApiRoute(async (request) => {
  const { service: admin } = await requireServiceRole(
    'admin questions-v2 fix preview — read questions_v2 across users',
    { allowedRoles: ['admin'] },
  );

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const id = body?.id;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data: row, error: loadErr } = await admin
    .from('questions_v2')
    .select('id, question_type, stimulus_html, stem_html, options, display_code, domain_name')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'question not found' }, { status: 404 });

  const force = body?.force === true;

  // Scope gate: Reading and Writing questions are off-limits. Their
  // italic formatting is prose emphasis (quoted titles, stressed
  // words), not math variables, and the rewrite rules would mangle
  // them with no visible upside. Admins can still force a fix with
  // `{ force: true }` if they really want to.
  if (!force && !isMathQuestion(row)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'not_math',
      suggestion: {
        stimulus_html: row.stimulus_html || null,
        stem_html: row.stem_html || '',
        options: Array.isArray(row.options)
          ? row.options
              .slice()
              .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
              .map((o) => ({ label: o.label, content_html: o.content_html || '' }))
          : [],
      },
    });
  }

  // Fast path: if the row has no detectable CollegeBoard garbage,
  // don't burn a Claude call on it. Return the fields unchanged so
  // the UI can show "no fix needed" without round-tripping the API.
  if (!force && isAlreadyClean(row)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'already_clean',
      suggestion: {
        stimulus_html: row.stimulus_html || null,
        stem_html: row.stem_html || '',
        options: Array.isArray(row.options)
          ? row.options
              .slice()
              .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
              .map((o) => ({ label: o.label, content_html: o.content_html || '' }))
          : [],
      },
    });
  }

  try {
    const suggestion = await askClaudeToRewrite(row);
    return NextResponse.json({ ok: true, suggestion });
  } catch (e) {
    console.error('questions-v2/fix POST error:', e);
    return NextResponse.json({ error: e.message || 'Claude request failed' }, { status: 500 });
  }
});

// ------------------------------------------------------------
// PUT — save an (edited) suggestion to questions_v2.
// ------------------------------------------------------------
export const PUT = legacyApiRoute(async (request) => {
  const { user, service: admin } = await requireServiceRole(
    'admin questions-v2 fix save — write to questions_v2 across users',
    { allowedRoles: ['admin'] },
  );

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { id, stimulus_html, stem_html, options } = body || {};
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

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
});

// ------------------------------------------------------------
// Claude call
// ------------------------------------------------------------
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

  // Route to Haiku for the ~80% of rows with trivial garbage, Sonnet
  // only for rows with <img alt> that needs semantic LaTeX conversion
  // or nested tables that need structural rewriting.
  const model = pickModel(row);

  // Prompt caching: mark the system prompt as cacheable so subsequent
  // calls within a 5-minute window pay ~10% of the input cost on the
  // 4000-token instructions. The tool schema is also cached since it
  // never changes between calls.
  const requestBody = JSON.stringify({
    model,
    max_tokens: 4000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
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
