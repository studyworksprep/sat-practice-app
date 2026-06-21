// Inverse of lib/content/bank-html.ts: turn clean bank HTML (math as
// literal \( … \) / \[ … \] TeX delimiters) into HTML the authoring
// editor's TipTap schema can parse, so an existing or AI-generated
// question can be loaded into the WYSIWYG editor for editing.
//
// The only transformation needed is the math: TipTap parses <p>,
// <strong>/<em>, <table>/<tr>/<th>/<td>, and <img> with its built-in
// rules, but it has no way to recognize a bare \( x \) in text as a
// math node. We rewrite the delimiters into the marker elements the
// MathInline / MathBlock nodes parse (span[data-math-inline] /
// div[data-math-block], reading the LaTeX from data-latex). The
// LaTeX — which in the bank can contain literal <, >, & — is escaped
// into the attribute, so the resulting string is well-formed HTML for
// the browser parser. ProseMirror lifts a block-level math <div> out
// of any wrapping <p>, which round-trips back to a centered display
// paragraph via the serializer.

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Rewrite \[ … \] and \( … \) delimiters in a bank-HTML string into
 * the editor's math-node marker elements. Returns '' for empty input.
 */
export function bankHtmlToEditorHtml(html: string | null | undefined): string {
  if (!html) return '';
  // Display math first (\[ … \]), then inline (\( … \)). The closing
  // delimiter is the escaped bracket/paren, so a bare ) inside f(x)
  // never terminates an inline match early.
  return html
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, latex) =>
      `<div data-math-block data-latex="${escapeAttr(String(latex).trim())}"></div>`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, latex) =>
      `<span data-math-inline data-latex="${escapeAttr(String(latex).trim())}"></span>`);
}
