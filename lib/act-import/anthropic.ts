// Thin Claude API wrapper for the ACT-import parsers.
//
// The pipeline needs a synchronous request/response shape that
// (a) accepts PDF inputs as document content blocks and
// (b) returns a single JSON-shaped text response. Existing
// callers in app/api/admin/* already hit Anthropic via raw
// fetch, so we follow the same pattern here rather than pull in
// @anthropic-ai/sdk just for this one surface.
//
// Defaults are tuned for the parser:
//   - claude-opus-4-7 for the questions/scale parsers (PDFs +
//     long structured-JSON output benefit from Opus's vision +
//     JSON discipline).
//   - max_tokens 32K — comfortable for a 60-question section
//     dump without hitting truncation.
//   - Streaming is enabled when max_tokens >= 16K so we don't
//     trip the 10-minute non-stream request timeout on a slow
//     parse.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-opus-4-7';
const STREAM_THRESHOLD = 16000;

export type TextBlock = { type: 'text'; text: string };
export type DocumentBlock = {
  type: 'document';
  source: {
    type: 'base64';
    media_type: 'application/pdf';
    data: string;
  };
};
export type ContentBlock = TextBlock | DocumentBlock;

export interface ClaudeCallOptions {
  system: string;
  userBlocks: ContentBlock[];
  /** Override the default model. Pass a date-suffixed string at
   *  your own risk — production code should use the canonical
   *  IDs (claude-opus-4-7, claude-sonnet-4-6, etc.). */
  model?: string;
  maxTokens?: number;
}

interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

/** Call Claude and return the text content of the assistant
 *  message. Throws on any non-2xx, missing text block, or
 *  max_tokens stop reason (which would indicate truncation). */
export async function callClaude(opts: ClaudeCallOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var is required');

  const model = opts.model ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 32000;
  const stream = maxTokens >= STREAM_THRESHOLD;

  const body = {
    model,
    max_tokens: maxTokens,
    stream,
    system: opts.system,
    messages: [{ role: 'user', content: opts.userBlocks }],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude API error (${res.status}): ${text.slice(0, 500)}`);
  }

  let text = '';
  let stopReason: string | undefined;

  if (stream) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error('Claude response had no body');
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of event.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (!payload || payload === '[DONE]') continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              text += evt.delta.text;
            } else if (evt.type === 'message_delta' && evt.delta?.stop_reason) {
              stopReason = evt.delta.stop_reason;
            }
          } catch {
            // Non-JSON keep-alive lines etc. — ignore.
          }
        }
      }
    }
  } else {
    const data = (await res.json()) as AnthropicMessageResponse;
    stopReason = data.stop_reason;
    text = (data.content ?? []).find((c) => c.type === 'text')?.text ?? '';
  }

  if (stopReason === 'max_tokens') {
    throw new Error('Claude response truncated at max_tokens — raise the limit or split the request.');
  }
  if (!text) {
    throw new Error('Claude returned an empty text response.');
  }
  return text;
}

/** Strip markdown code fences Claude sometimes adds around JSON
 *  responses, then JSON.parse. Throws a readable error if the
 *  result isn't parseable. */
export function parseClaudeJson<T>(text: string): T {
  let trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    trimmed = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch (err) {
    const head = trimmed.slice(0, 200);
    throw new Error(
      `Could not parse Claude JSON response: ${(err as Error).message}. First 200 chars: ${head}`,
    );
  }
}
