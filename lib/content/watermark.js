// Per-user HTML watermarking. See docs/architecture-plan.md §3.7.
//
// Injects a zero-width character pattern derived from a user id into
// rendered question HTML. The pattern is:
//   - Invisible to normal rendering (uses U+200B, U+200C, U+200D).
//   - Preserved across copy-paste into plain text editors.
//   - Decodable from any leaked text by reversing the encoding.
//   - Injected only between tags and inside whitespace runs — never
//     inside `alt`, `aria-label`, or any screen-reader-visible
//     attribute — so watermarking does not affect accessibility.
//
// If a student pastes a question into a public Discord or a cheat-
// sharing site, the watermark lets us trace back to the originating
// user id. It's not a silver bullet (a motivated attacker can strip
// the characters), but it's cheap deterrence against casual leaks.
//
// DORMANT IN PHASE 1: no route currently calls these helpers. Phase 2
// wires up the server-rendered practice page in `app/next/*` to pass
// its output through `applyWatermark(html, userId)` before sending.

const ZW_SPACE = '\u200B'; // zero-width space — bit 0
const ZW_NON_JOINER = '\u200C'; // zero-width non-joiner — bit 1
const ZW_JOINER = '\u200D'; // zero-width joiner — delimiter

// Attributes where a zero-width character would be harmful (screen
// readers speak alt text literally; ARIA attributes may be parsed).
// The injection walker skips tags containing any of these attributes.
const SAFE_SKIP_ATTRS = new Set([
  'alt',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'title',
]);

/**
 * Encode an arbitrary string payload as a zero-width character sequence.
 * The output is a run of ZW_SPACE / ZW_NON_JOINER characters bounded by
 * ZW_JOINER delimiters so decoders can find the payload inside leaked text.
 *
 * @param {string} payload
 * @returns {string}
 */
export function encodePayload(payload) {
  let bits = '';
  for (const ch of String(payload)) {
    const code = ch.charCodeAt(0);
    bits += code.toString(2).padStart(16, '0');
  }
  let encoded = ZW_JOINER;
  for (const b of bits) {
    encoded += b === '1' ? ZW_NON_JOINER : ZW_SPACE;
  }
  encoded += ZW_JOINER;
  return encoded;
}

/**
 * Decode a zero-width payload run from leaked text. Returns null if no
 * payload delimiters are found or the bitstream is not a valid multiple
 * of 16 bits.
 *
 * @param {string} text
 * @returns {string|null}
 */
export function decodePayload(text) {
  const start = text.indexOf(ZW_JOINER);
  if (start === -1) return null;
  const end = text.indexOf(ZW_JOINER, start + 1);
  if (end === -1) return null;
  const run = text.slice(start + 1, end);
  let bits = '';
  for (const ch of run) {
    if (ch === ZW_SPACE) bits += '0';
    else if (ch === ZW_NON_JOINER) bits += '1';
    else return null;
  }
  if (bits.length === 0 || bits.length % 16 !== 0) return null;
  let out = '';
  for (let i = 0; i < bits.length; i += 16) {
    out += String.fromCharCode(parseInt(bits.slice(i, i + 16), 2));
  }
  return out;
}

/**
 * Derive a short, reversible tag from a user id. We use a truncated
 * form of the UUID's first segment (8 hex chars = 32 bits) so the
 * watermark is ~10 bytes encoded, keeping the payload small. Reversing
 * from the tag alone requires cross-referencing with the profiles
 * table, which is intentional: leaked content + profiles lookup = trace.
 *
 * @param {string} userId - UUID
 * @returns {string}
 */
export function watermarkTag(userId) {
  if (!userId || typeof userId !== 'string') return '';
  const trimmed = userId.replace(/-/g, '').slice(0, 8);
  return trimmed;
}

/**
 * Apply a watermark to an HTML string. Injects an encoded payload at
 * the first safe insertion point (between tags, outside of any
 * skip-listed attribute context). Returns the watermarked HTML.
 *
 * Not a full HTML parser — the implementation uses regex-based tag
 * scanning, which is safe for the already-rendered, trusted HTML we
 * produce from question content (no user-controlled input). If the
 * rebuild ever adopts a proper HTML-tree rendering pipeline, this
 * helper can be swapped for an AST-walking version.
 *
 * @param {string} html
 * @param {string} userId
 * @returns {string}
 */
export function applyWatermark(html, userId) {
  if (!html || typeof html !== 'string') return html;
  const tag = watermarkTag(userId);
  if (!tag) return html;
  const payload = encodePayload(tag);

  // Find the first tag boundary that is not inside an attribute we
  // care about. We scan for `>` that closes an opening tag, then
  // insert the payload right after it. Skip self-closing void tags
  // that have a skip-listed attribute in the same tag.
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let m;
  while ((m = tagRegex.exec(html))) {
    const attrs = m[2] || '';
    const lowered = attrs.toLowerCase();
    const hasSkipAttr = [...SAFE_SKIP_ATTRS].some((a) =>
      lowered.includes(`${a}=`),
    );
    if (hasSkipAttr) continue;
    const insertAt = m.index + m[0].length;
    return html.slice(0, insertAt) + payload + html.slice(insertAt);
  }

  // No safe tag found; return the original HTML untouched rather than
  // risk corrupting an alt-text-only fragment.
  return html;
}
