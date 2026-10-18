import sanitizeHtml from 'sanitize-html';

/** Full-page raster passages cannot provide reflowable, selectable text. */
export function isRasterActPassage(html: string): boolean {
  return /<img\b[^>]*\balt=["'][^"']*original PDF page/i.test(html)
    || (/<img\b/i.test(html) && /class=["'][^"']*qref/.test(html) && /position\s*:\s*absolute/i.test(html));
}

/** Normalize prose presentation without rewriting words, punctuation, references,
 * figures, tables, or math. Run security sanitization separately at the UI boundary. */
export function normalizeActPassageHtml(html: string): string {
  // Legacy images remain visible until their source-verified text is migrated.
  if (isRasterActPassage(html)) return html;
  return sanitizeHtml(html, {
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true,
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    transformTags: Object.fromEntries(['p','div','span','h1','h2','h3','h4','h5','h6','blockquote'].map(tag => [tag,
      (tagName: string, attribs: Record<string,string>) => {
        const rest = { ...attribs };
        delete rest.style;
        return { tagName, attribs: rest };
      }])),
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
  });
}
