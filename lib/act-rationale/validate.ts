// Pure helpers for the ACT rationale pipeline — figure extraction
// from question HTML and the post-generation validator. No I/O so
// they unit-test directly (validate.test.mjs).

export interface RationaleCheckInput {
  rationaleHtml: string;
  /** Letter the model said was correct. */
  answerLetter: string;
  /** Label of the keyed option. */
  correctLabel: string;
  /** All option labels on the question, in order. */
  labels: string[];
  confidence?: string | null;
}

export interface RationaleCheckResult {
  /** Hard failures — the draft must not be auto-approved and the
   *  reviewer sees these first. */
  errors: string[];
  /** Soft flags — stored on the draft and hold it out of bulk
   *  approve, but the text may still be fine. */
  warnings: string[];
}

/** Pull absolute figure URLs out of stem/stimulus/option HTML so they
 *  can be attached to the request as image blocks. Only http(s)
 *  sources — data URIs and relative paths are skipped (the bank's
 *  figures live in a public bucket). De-duplicated, order kept. */
export function extractFigureUrls(...htmlParts: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  for (const part of htmlParts) {
    if (!part) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(part)) !== null) {
      const url = m[1].trim();
      if (!/^https?:\/\//i.test(url)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordCount(text: string): number {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

/** Validate a generated rationale against the question's key. */
export function validateRationale(input: RationaleCheckInput): RationaleCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const html = (input.rationaleHtml ?? '').trim();
  const text = stripTags(html);
  const answer = (input.answerLetter ?? '').trim().toUpperCase();
  const correct = (input.correctLabel ?? '').trim().toUpperCase();
  const labels = input.labels.map((l) => l.trim().toUpperCase());

  if (!html) errors.push('Rationale is empty.');
  if (!answer) errors.push('No answer letter returned.');
  else if (answer !== correct) {
    errors.push(`Model identified ${answer} as correct; the key is ${correct}.`);
  }
  if (answer && labels.length > 0 && !labels.includes(answer)) {
    errors.push(`Answer letter ${answer} is not one of the option labels (${labels.join(', ')}).`);
  }

  if (/<img\b/i.test(html)) warnings.push('Contains an <img> tag.');
  if (/<(script|style|iframe|table)\b/i.test(html)) warnings.push('Contains a disallowed tag (script/style/iframe/table).');
  if (/^\s*#|\*\*[^*]+\*\*/m.test(html)) warnings.push('Looks like markdown rather than HTML.');

  const words = wordCount(text);
  if (words > 0 && words < 50) warnings.push(`Short (${words} words).`);
  if (words > 260) warnings.push(`Long (${words} words).`);

  // Each wrong option should be addressed by letter. Missing letters
  // are a warning, not an error — a two-option "which is NOT" item
  // can legitimately skip them.
  if (correct && labels.length > 0) {
    const missing = labels.filter((l) => l !== correct && !new RegExp(`\\b${l}\\b`).test(text));
    if (missing.length > 0) warnings.push(`Does not mention option${missing.length === 1 ? '' : 's'} ${missing.join(', ')}.`);
  }

  if (input.confidence && input.confidence !== 'high') {
    warnings.push(`Model confidence: ${input.confidence}.`);
  }

  return { errors, warnings };
}
