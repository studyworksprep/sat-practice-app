// Extract embedded figures from a Mathpix HTML export and
// rehost them on the question-figures bucket.
//
// Mathpix's HTML output inlines every figure as a base64 data
// URL on the <img> element:
//
//   <img src="data:image/jpeg;base64,/9j/4AAQ…" />
//   <img src="data:image/png;base64,iVBORw0KGgo…" />
//
// Two problems with leaving them inline:
//   1. Each data URL is tens of KB of token spend when handed
//      back to Claude — a single math section can easily push
//      the user-side payload over 1 MB.
//   2. We want the figures to render in the runner; data URLs
//      embedded in stem_html would survive sanitization but
//      bloat the stored row and slow page loads.
//
// Fix: walk the HTML for data: URLs, decode + content-address
// each binary into the question-figures bucket (the same bucket
// the rest of the admin tree uses), and rewrite the src in
// place with the resulting public URL. Claude then sees clean
// <img src="https://…"/> tags and copies them straight into
// stem_html, and the runner serves the figure from CDN.
//
// Idempotent. Re-processing the same HTML produces the same
// hash-named upload (overwritten via upsert: true), so a
// re-parse of the same job is a no-op for unchanged figures
// and an update where Mathpix happened to produce different
// pixels.

import type { SupabaseClient } from '@supabase/supabase-js';

const FIGURES_BUCKET = 'question-figures';

// `src="data:..."` and `src='data:...'`; `<img ... src=data:...>` (unquoted)
// would be invalid HTML and we don't try to support it.
const DATA_URL_IMG_RE = /<img\b[^>]*\bsrc\s*=\s*(["'])(data:image\/([a-z0-9+.-]+);base64,([^"']+))\1[^>]*>/gi;

export interface FigureExtractionResult {
  /** HTML with each data: URL replaced by a public bucket URL. */
  html: string;
  /** Number of figures rehosted. */
  rehosted: number;
  /** Non-fatal issues encountered while uploading. */
  warnings: string[];
}

/** Find every <img src="data:image/…"> in the input HTML,
 *  decode + upload each binary to the question-figures bucket,
 *  and return the HTML with the src attributes rewritten to
 *  the public URL of the rehosted file. */
export async function rehostMathpixFigures(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  html: string,
): Promise<FigureExtractionResult> {
  if (!html || typeof html !== 'string') {
    return { html: html ?? '', rehosted: 0, warnings: [] };
  }

  // Two-pass approach: collect all matches first, then do the
  // uploads in parallel, then run the replacements. Lets a
  // single upload failure surface as a warning without halting
  // the whole pre-process.
  const matches: Array<{
    full: string;
    src: string;
    mime: string;
    base64: string;
  }> = [];

  let m: RegExpExecArray | null;
  while ((m = DATA_URL_IMG_RE.exec(html)) !== null) {
    const [full, , src, subtype, base64] = m;
    matches.push({
      full,
      src,
      mime: `image/${subtype.toLowerCase()}`,
      base64,
    });
  }

  if (matches.length === 0) {
    return { html, rehosted: 0, warnings: [] };
  }

  const warnings: string[] = [];
  const replacements = new Map<string, string>();

  await Promise.all(
    matches.map(async (match) => {
      try {
        const bytes = decodeBase64(match.base64);
        const hash = await sha256Hex(bytes);
        const ext = extensionForMime(match.mime);
        const path = `act-mathpix/${hash}.${ext}`;
        const { error } = await supabase.storage
          .from(FIGURES_BUCKET)
          .upload(path, bytes, { contentType: match.mime, upsert: true });
        if (error) {
          warnings.push(`Figure upload failed (${match.mime}): ${error.message}`);
          return;
        }
        const { data } = supabase.storage.from(FIGURES_BUCKET).getPublicUrl(path);
        const publicUrl = data?.publicUrl;
        if (!publicUrl) {
          warnings.push(`Figure upload succeeded but no public URL returned (${path})`);
          return;
        }
        replacements.set(match.src, publicUrl);
      } catch (err) {
        warnings.push(`Figure decode failed: ${(err as Error).message}`);
      }
    }),
  );

  // Single-pass string replace. Each data: URL is unique
  // enough (the base64 fingerprint is the identity) that we
  // don't need to worry about partial collisions.
  let rewritten = html;
  for (const [src, publicUrl] of replacements) {
    rewritten = rewritten.split(src).join(publicUrl);
  }

  return { html: rewritten, rehosted: replacements.size, warnings };
}

function decodeBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Web Crypto is available in both the Node runtime (>=18) and
  // the Edge runtime. Same call site as the SAT-side
  // FieldWithUpload helper. Copy into a standalone ArrayBuffer
  // because crypto.subtle.digest's TS types narrow to
  // ArrayBuffer (not SharedArrayBuffer), and Uint8Array.buffer
  // is typed as ArrayBufferLike.
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/png':  return 'png';
    case 'image/gif':  return 'gif';
    case 'image/webp': return 'webp';
    case 'image/svg+xml': return 'svg';
    default: {
      // Fall back to the subtype after the slash. Constrain to
      // [a-z0-9] so a weird MIME doesn't yield a path with
      // path-separator chars.
      const tail = mime.split('/')[1] ?? 'bin';
      const cleaned = tail.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleaned || 'bin';
    }
  }
}
