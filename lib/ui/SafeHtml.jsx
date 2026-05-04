// SafeHtml — single primitive for every place that needs to render
// untrusted or admin-authored HTML. Wraps DOMPurify + the React
// dangerouslySetInnerHTML pattern so callers don't have to remember
// to sanitize on every site.
//
// Two profiles via the `kind` prop:
//
//   kind="question" (default) — admin-authored question content,
//     keeps MathML / SVG / safe HTML, strips <script>, on*,
//     javascript:.
//
//   kind="note" — user-authored note content (TipTap output),
//     stricter allowlist sized to what docToFullHtml emits plus
//     the inline SVG that Excalidraw drawings produce.
//
// Math typesetting is intentionally NOT handled here — that's the
// job of QuestionRenderer's MathJax effect or HtmlBlock's
// MathJax-loader. SafeHtml is a leaf concern.
//
// See lib/sanitize.ts for the allowlists.

'use client';

import { useMemo } from 'react';
import { sanitizeNoteHtml, sanitizeQuestionHtml } from '@/lib/sanitize';

/**
 * @param {object} props
 * @param {string} props.html — raw HTML string to render after sanitization.
 * @param {'question' | 'note'} [props.kind='question'] — sanitization profile.
 * @param {string} [props.as='div'] — wrapping tag name.
 * @param {string} [props.className]
 */
export function SafeHtml({ html, kind = 'question', as = 'div', className, ...rest }) {
  const Tag = as;
  const safe = useMemo(
    () => (kind === 'note' ? sanitizeNoteHtml(html ?? '') : sanitizeQuestionHtml(html ?? '')),
    [html, kind],
  );
  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: safe }}
      {...rest}
    />
  );
}
