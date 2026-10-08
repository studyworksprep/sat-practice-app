// Offline normalization of reviewed bank content. This intentionally does
// not infer TeX from accessibility speech: callers supply reviewed formulas.
import { parseHTML } from 'linkedom';
import { sanitizeQuestionHtml } from '../sanitize.ts';
import { BANK_TABLE_CLASS, bankParagraphTag, type BankFieldKind } from './bank-html-conventions.ts';

export interface ReviewedMathImage { alt: string; tex: string }
export interface NormalizeBankHtmlOptions {
  // Keyed by exact original src, after the caller verifies source provenance.
  mathImages?: ReadonlyMap<string, ReviewedMathImage>;
  mathVariables?: ReadonlySet<string>;
  requireReviewedMath?: boolean;
}

export function normalizeBankHtml(
  html: string | null | undefined,
  kind: BankFieldKind,
  options: NormalizeBankHtmlOptions = {},
): string | null {
  if (!html?.trim()) return null;

  // Protect literal < and & inside TeX before HTML parsing/sanitization.
  // Newly inserted formulas use the same path, keeping this idempotent.
  let prefix = 'SWBANKMATHTOKEN';
  while (html.includes(prefix)) prefix += 'X';
  const formulas: string[] = [];
  const protect = (formula: string) => `${prefix}${formulas.push(formula) - 1}END`;
  const protectedHtml = html.replace(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, protect);
  const { document } = parseHTML(`<html><body>${protectedHtml}</body></html>`);
  const dom = document.body;

  for (const node of [...dom.querySelectorAll('[data-ae_invis]')]) {
    if (node.textContent.trim() || node.querySelector('img,math,svg,table')) {
      throw new Error('Invisible source node contains content; review before normalizing');
    }
    node.remove();
  }
  for (const img of [...dom.querySelectorAll('img[role="math"], img.math-img')]) {
    const src = img.getAttribute('src') ?? '';
    const alt = (img.getAttribute('alt') ?? '').trim().replace(/\s+/g, ' ');
    const reviewed = options.mathImages?.get(src);
    if (!reviewed) {
      if (options.requireReviewedMath) throw new Error(`Unreviewed equation image: ${alt}`);
      continue;
    }
    if (reviewed.alt !== alt || !reviewed.tex.trim() || /\\[()[\]]/.test(reviewed.tex)) {
      throw new Error(`Reviewed formula does not match the original image: ${alt}`);
    }
    img.replaceWith(protect(`\\(${reviewed.tex}\\)`));
  }
  for (const node of [...dom.querySelectorAll('span.italic')]) {
    if (node.closest('math,svg,mjx-container')) continue;
    const match = node.textContent.match(/^(\s*)([A-Za-z]{1,3})([,.]?)(\s*)$/);
    if (match && options.mathVariables?.has(match[2])) {
      node.replaceWith(match[1] + protect(`\\(${match[2]}\\)`) + match[3] + match[4]);
    } else {
      const em = document.createElement('em'); em.innerHTML = node.innerHTML; node.replaceWith(em);
    }
  }
  for (const node of [...dom.querySelectorAll('span,div')].reverse()) {
    if (node.closest('math,svg,mjx-container')) continue;
    // Preserve semantic spans/containers. Imported layout-only wrappers
    // have no semantics and are replaced by the bank's paragraph/table tags.
    if (node.hasAttribute('aria-label') || node.hasAttribute('role') || node.hasAttribute('data-q')) continue;
    if (node.localName === 'div' && [...node.childNodes].some(n => n.nodeType === 3 && n.textContent?.trim())) {
      const p = document.createElement('p'); p.innerHTML = node.innerHTML; node.replaceWith(p);
    } else node.replaceWith(...node.childNodes);
  }
  for (const node of dom.querySelectorAll('*')) {
    if (node.closest('math,svg,mjx-container')) continue;
    const isEquation = node.localName === 'img' && (node.getAttribute('role') === 'math' || node.classList.contains('math-img'));
    const alignment = [...node.attributes].find(a => a.name.toLowerCase() === 'align')?.value.toLowerCase()
      ?? (node as HTMLElement).style?.textAlign;
    const allowed = new Set(['colspan', 'rowspan', 'scope', 'headers', 'href', 'target', 'rel', 'aria-label', 'role', 'data-q', 'lang', 'dir']);
    if (node.localName === 'img') for (const attr of ['src', 'alt', 'width', 'height']) allowed.add(attr);
    if (node.localName === 'col' || node.localName === 'colgroup') allowed.add('span');
    for (const attr of [...node.attributes]) if (!allowed.has(attr.name)) node.removeAttribute(attr.name);
    if (node.localName === 'img') {
      // Keep source identity and equation markers when conversion is deferred.
      node.setAttribute('style', 'max-width:100%;height:auto;');
      if (isEquation) { node.setAttribute('role', 'math'); node.setAttribute('class', 'math-img'); }
    }
    if (node.localName === 'p') {
      if (kind === 'stem' || kind === 'stimulus') node.setAttribute('class', `${kind}_paragraph`);
      if (['center', 'right', 'left'].includes(alignment ?? '')) node.setAttribute('style', `text-align:${alignment};`);
    }
    if (node.localName === 'table') node.setAttribute('class', BANK_TABLE_CLASS);
  }
  for (const node of [...dom.querySelectorAll('p')]) {
    if (!node.textContent.trim() && !node.querySelector('img,table,math,svg,mjx-container')) node.remove();
  }
  if (kind === 'option' && dom.children.length === 1 && dom.firstElementChild?.localName === 'p') {
    dom.firstElementChild.replaceWith(...dom.firstElementChild.childNodes);
  }
  if (kind === 'option' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(dom.textContent.trim())) {
    dom.textContent = protect(`\\(${dom.textContent.trim().replace('%', '\\%')}\\)`);
  }
  // Bare prose runs become ordinary bank paragraphs; tables remain blocks.
  if (kind !== 'option') {
    let paragraph: ReturnType<typeof document.createElement> | null = null;
    for (const node of [...dom.childNodes]) {
      const block = node.nodeType === 1 && /^(?:p|table|figure|div|ul|ol|blockquote|h[1-6])$/.test((node as HTMLElement).localName);
      if (block) { paragraph = null; continue; }
      if (!paragraph && !node.textContent?.trim() && node.nodeType === 3) continue;
      if (!paragraph) {
        const wrapper = parseHTML(bankParagraphTag(kind) + '</p>').document.firstElementChild!;
        paragraph = document.createElement('p');
        if (wrapper.getAttribute('class')) paragraph.setAttribute('class', wrapper.getAttribute('class')!);
        dom.insertBefore(paragraph, node);
      }
      paragraph.appendChild(node);
    }
  }
  let result = sanitizeQuestionHtml(dom.innerHTML);
  result = result.replace(new RegExp(`${prefix}(\\d+)END`, 'g'), (_, index) => formulas[Number(index)]);
  return result.trim() ? result : null;
}
