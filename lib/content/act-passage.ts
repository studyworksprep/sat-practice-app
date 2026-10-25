import sanitizeHtml from 'sanitize-html';

const attribution = /^(?:INFORMATIONAL|LITERARY NARRATIVE|PROSE FICTION|SOCIAL SCIENCE|HUMANITIES|NATURAL SCIENCE):\s*(?:This passage|Passage A)\b/i;
// Editorial introductions in the bank, not opening sentences of the passages.
const editorialIntroduction = /^(?:The researchers, who are also the authors of the passage,|This story takes place in Iran in the 1940s\.|Originally cultivated in the Ottoman Empire, tulips|The term [“"]?living fossil[”"]? refers to|The term b-boying refers to|The full name of the colleague the author mentions)/;

function markIntroductions(html: string): string {
  let afterAttribution = false;
  return html.replace(/<(p|div)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (block, tag, attributes, content) => {
    const text = content.replace(/<[^>]*>/g, '').trim();
    const isAttribution = attribution.test(text);
    const existingNote = /class=["'][^"']*\bsource-note\b/.test(attributes);
    const isNote = existingNote || isAttribution || (afterAttribution && editorialIntroduction.test(text));
    afterAttribution = isNote;
    const isLineHelp = text === 'Bracketed numbers identify original source lines.';
    if (!isNote && !isLineHelp) return block;
    const className = isNote ? 'source-note' : 'source-line-help';
    if (!new RegExp(`class=["'][^"']*\\b${className}\\b`).test(attributes)) {
      attributes = /class=["']/.test(attributes)
        ? attributes.replace(/class=(["'])/, `class=$1${className} `)
        : `${attributes} class="${className}"`;
    }
    // Some imports omitted the space outside the bold genre label.
    if (isAttribution) content = content.replace(/(:<\/strong>)(?=\S)/i, '$1 ');
    return `<${tag}${attributes}>${content}</${tag}>`;
  });
}

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
  return sanitizeHtml(markIntroductions(html), {
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
