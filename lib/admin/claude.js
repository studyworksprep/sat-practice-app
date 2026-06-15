// Shared Anthropic Messages API helper for admin server routes.
//
// The codebase calls Claude over raw fetch (no SDK dependency); this
// centralizes the POST + retry/backoff so each route doesn't
// re-implement it. Mirrors the retry policy already proven in
// app/api/admin/questions-v2/fix/route.js: retry transient 408/503/529
// and network errors with exponential backoff, fail fast on the rest.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export async function fetchClaudeMessages(requestBody) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var is required');

  const MAX_ATTEMPTS = 4;
  const RETRYABLE = new Set([408, 503, 529]);
  const body = typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody);

  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body,
      });
    } catch (networkErr) {
      lastError = new Error(`Claude API network error: ${networkErr.message || networkErr}`);
      if (attempt < MAX_ATTEMPTS - 1) { await sleep(backoffMs(attempt)); continue; }
      throw lastError;
    }

    if (res.ok) return res.json();

    const errText = await res.text();
    if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
      lastError = new Error(`Claude API error (${res.status}): ${errText}`);
      await sleep(backoffMs(attempt));
      continue;
    }
    throw new Error(`Claude API error (${res.status}): ${errText}`);
  }
  throw lastError || new Error('Claude API request failed after retries');
}

// Pull the single expected tool_use block's parsed input out of a
// Messages API response. Returns null if the model didn't call it.
export function extractToolUse(response, toolName) {
  const block = (response?.content || []).find(
    (c) => c.type === 'tool_use' && c.name === toolName,
  );
  return block ? (block.input ?? null) : null;
}

function backoffMs(attempt) {
  const base = 1000 * Math.pow(2, attempt);
  const jitter = Math.floor((Math.random() - 0.5) * 500);
  return Math.max(250, base + jitter);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
