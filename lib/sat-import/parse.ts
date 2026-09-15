import { createHash } from 'node:crypto';
export interface ImportMetadata {
  questionId: string;
  correct_answer?: string | string[] | null;
  external_id?: string | null;
  ibn?: string | null;
  primary_class_cd_desc?: string | null;
  skill_desc?: string | null;
  difficulty?: 'E' | 'M' | 'H' | null;
  score_band_range_cd?: number | null;
}
// Pure, bounded parser for College Board question exports. No DB writes.
export const MAX_QUESTIONS = 100;
export const MAX_TEXT = 1_000_000;

export function parseMetadata(raw = ''): ImportMetadata[] {
  if (typeof raw !== 'string' || raw.length > MAX_TEXT) throw new Error('Metadata must be under 1 MB.');
  if (!raw.trim()) return [];
  // TextEdit wraps JSON in RTF. Extract only the JSON array, respecting
  // escaped literal braces; reject anything that no longer parses as JSON.
  if (raw.startsWith('{\\rtf')) {
    raw = raw.slice(raw.indexOf('['));
    raw = raw.replace(/\\\r?\n/g, '\n').replace(/\\([{}\\])/g, '$1');
    raw = raw.slice(0, raw.lastIndexOf(']') + 1);
  }
  let rows;
  try { rows = JSON.parse(raw); } catch { throw new Error('Metadata must contain a JSON array. Export rich text as plain text if conversion fails.'); }
  if (!Array.isArray(rows) || rows.length > MAX_QUESTIONS) throw new Error('Metadata must be an array of at most 100 questions.');
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row.questionId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.questionId)) throw new Error('Each metadata row needs a valid questionId.');
    if (ids.has(row.questionId)) throw new Error(`Duplicate metadata ID: ${row.questionId}`);
    ids.add(row.questionId);
    if (row.correct_answer != null && !(typeof row.correct_answer === 'string' || (Array.isArray(row.correct_answer) && row.correct_answer.length <= 20 && row.correct_answer.every((v: unknown) => typeof v === 'string')))) throw new Error('Metadata correct_answer must be a string or an array of strings.');
    for (const field of ['primary_class_cd_desc', 'skill_desc']) if (row[field] != null && (typeof row[field] !== 'string' || row[field].length > 300)) throw new Error(`Invalid ${field} for ${row.questionId}.`);
    if (row.difficulty != null && !['E','M','H'].includes(row.difficulty)) throw new Error(`Invalid difficulty for ${row.questionId}; expected E, M, or H.`);
    if (row.score_band_range_cd != null && (!Number.isInteger(row.score_band_range_cd) || row.score_band_range_cd < 1 || row.score_band_range_cd > 7)) throw new Error(`Invalid score band for ${row.questionId}.`);
    for (const field of ['external_id', 'ibn']) if (row[field] != null && (typeof row[field] !== 'string' || row[field].length > 150)) throw new Error(`Invalid ${field} for ${row.questionId}.`);
  }
  return rows as ImportMetadata[];
}

export function parseQuestions(mmd: string, metadata: ImportMetadata[] = []) {
  if (typeof mmd !== 'string' || mmd.length > MAX_TEXT) throw new Error('Mathpix text must be under 1 MB.');
  mmd = normalizeMathpixHeadings(mmd);
  if (!/\\section\*\{Question ID:/.test(mmd)) mmd = numberedExport(mmd);
  const parts = mmd.split(/\\section\*\{Question ID:\s*([a-zA-Z0-9_-]+)\}/);
  if (parts.length < 3) throw new Error('No question headings found. Use Question ID headings or numbered headings such as ## Question 1.');
  if ((parts.length - 1) / 2 > MAX_QUESTIONS) throw new Error('Please import at most 100 questions at a time.');
  const ids = new Set();
  const questions = [];
  for (let i = 1; i < parts.length; i += 2) {
    const id = parts[i];
    if (ids.has(id)) throw new Error(`Repeated question ID: ${id}`);
    ids.add(id);
    const body = parts[i + 1];
    const marker = /(?:^|\n)Question\s*\n/.exec(body);
    if (!marker) throw new Error(`Question ${id} has no question body.`);
    const content = body.slice(marker.index + marker[0].length);
    const answerMatch = /\nCorrect Answer:\s*([^\n]+)/.exec(content);
    const rationaleMatch = /\nRationale\s*\n/.exec(content);
    const questionEnd = Math.min(answerMatch?.index ?? content.length, rationaleMatch?.index ?? content.length);
    const question = content.slice(0, questionEnd).trim();
    const answerHeading = /\nAnswer\s*\n/.exec(question);
    let stem = question;
    let options: Array<{ label: string; mmd: string }> = [];
    if (answerHeading) {
      stem = question.slice(0, answerHeading.index).trim();
      const choices = question.slice(answerHeading.index + answerHeading[0].length);
      options = [...choices.matchAll(/\\item\[([A-Da-d])\.\]\s*([\s\S]*?)(?=\\item\[|\\end\{itemize\})/g)].map(m => ({ label: m[1].toUpperCase(), mmd: m[2].trim() }));
      if (options.length !== 4 || options.some((o, j) => o.label !== 'ABCD'[j] || !o.mmd)) throw new Error(`Question ${id}: expected four complete choices A–D.`);
    }
    if (!stem) throw new Error(`Question ${id} has an empty prompt.`);
    const meta = metadata.find(row => row.questionId === id);
    const metadataAnswer = Array.isArray(meta?.correct_answer) ? meta.correct_answer.join(', ') : meta?.correct_answer;
    const answer = answerMatch?.[1].trim() || metadataAnswer?.trim() || '';
    const rationale = rationaleMatch ? content.slice(rationaleMatch.index + rationaleMatch[0].length).trim() : '';
    if (options.length && answer && !/^[A-D]$/.test(answer)) throw new Error(`Question ${id}: answer must identify one choice A–D.`);
    const warnings = [];
    if (answerMatch && metadataAnswer && answer !== metadataAnswer.trim()) warnings.push('The export answer and metadata answer differ. Verify the answer before publishing.');
    if (!answer) warnings.push('No correct answer supplied.');
    if (!rationale) warnings.push('No explanation supplied.');
    if (/\$\s+\$|\$\s*[+-]\s*\d|\d\s+\$=/.test(rationale)) warnings.push('Some explanation equations are split across text and math. Check spacing.');
    if (!meta) warnings.push('No matching metadata supplied.');
    const values = options.length ? [] : answer.split(',').map(v => v.trim()).filter(Boolean);
    // Numeric forms in the explanation can differ from the explicit key.
    const entered = rationale.match(/Note that ([\s\S]*?)examples of ways to enter a correct answer/i);
    if (entered) warnings.push('The explanation describes accepted answer forms. Compare them with the explicit answer key.');
    questions.push({ id, stem, options, rationale, answer, warnings, metadata: meta ?? { questionId: id }, questionType: options.length ? 'mcq' as const : 'spr' as const, correctAnswer: options.length ? { option_label: answer || null } : { text: JSON.stringify(values) } });
  }
  const unused = metadata.filter(m => !ids.has(m.questionId));
  return { questions, warnings: unused.length ? [`${unused.length} metadata record(s) have no matching question: ${unused.map(m => m.questionId).join(', ')}`] : [] };
}

// Mathpix sometimes puts the ID in the metadata-table caption and the
// Question label in a figure caption. Recognize these exact wrappers only.
function normalizeMathpixHeadings(text: string): string {
  return text.replace(/\\begin\{table\}\s*\\captionsetup\{labelformat=empty\}\s*\\caption\{Question ID:\s*([a-zA-Z0-9_-]+)\}([\s\S]*?)\\end\{table\}/g,
    (_, id, header) => `\\section*{Question ID: ${id}}\n${header}`)
    .replace(/\\begin\{figure\}\s*\\captionsetup\{labelformat=empty\}\s*\\caption\{Question\}\s*\\includegraphics(?:\[[^\n]*?\])?\{([^}\n]+)\}\s*\\end\{figure\}/g,
      (_, path) => `Question\n![](${path})`);
}

// Numbered exports get content-derived IDs: page numbering is not a source identity.
export function numberedExport(text: string): string {
  const sections=text.split(/(?:^|\n)(?:#{1,3}\s+Question\s+\d+|\\section\*\{Question\s+\d+\})[ \t]*\n/i);
  if(sections.length<2) return text;
  return sections.slice(1).map(body=>{
    const id='local-'+createHash('sha256').update(body.trim().replace(/\s+/g,' ')).digest('hex').slice(0,24);
    let content=body.trim().replace(/^Question\s*\n/i,'')
      .replace(/^(?:#{1,3}\s*)?(?:Correct Answer|Answer):[ \t]*/gmi,'Correct Answer: ')
      .replace(/^(?:#{1,3}\s*)?(?:Explanation|Rationale)[ \t]*:?[ \t]*$/gmi,'Rationale');
    const end=content.search(/\n(?:Correct Answer:|Rationale\n)/);
    let prompt=end<0?content:content.slice(0,end);
    const suffix=end<0?'':content.slice(end);
    if(/\nA[.)]\s/.test(prompt)) {
      prompt=prompt.replace(/\nA[.)]\s/, '\nAnswer\n\\begin{itemize}\n\\item[A.] ')
        .replace(/\n([B-D])[.)]\s/g, '\n\\item[$1.] ')+ '\n\\end{itemize}';
    }
    content=prompt+suffix;
    return `\\section*{Question ID: ${id}}\nQuestion\n${content}\n`;
  }).join('\n');
}

export const escapeHtml = (s: string) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c));

// Deliberately supports only the formats found in this export, rejecting
// unsupported structural LaTeX rather than silently dropping content.
export function mmdToHtml(text: string, images: Record<string, string> = {}, options: { equationAlign?: 'left' | 'center' } = {}): string {
  const tokens: string[] = [];
  const blocks = new Set<string>();
  const token = (html: string, block = false) => {
    const marker = `IMPORTTOKEN${tokens.push(html) - 1}END`;
    if (block) blocks.add(marker);
    return block ? `\n\n${marker}\n\n` : marker;
  };
  if (/IMPORTTOKEN\d+END/.test(text)) throw new Error('Reserved token in input.');
  text = text.replace(/\\begin\{tabular\}(?:\[[^\]]*\])?\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g, (_, body: string) => {
    const rows = body.replace(/\\hline/g, '').split(/\\\\/).map(r => r.trim()).filter(Boolean);
    return token(`<table><tbody>${rows.map((row, i) => `<tr>${row.split('&').map(cell => {
      let content = mmdToHtml(cell.trim(), images);
      // A simple cell is inline content, not a prose paragraph. Keeping
      // that wrapper adds the runner's paragraph margins to every row.
      // Leave multiple paragraphs and other block content intact.
      if (content.startsWith('<p>') && content.indexOf('</p>') === content.length - 4) content = content.slice(3, -4);
      const tag = i ? 'td' : 'th';
      return `<${tag} style="text-align:center"${i ? '' : ' scope="col"'}>${content}</${tag}>`;
    }).join('')}</tr>`).join('')}</tbody></table>`, true);
  });
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, path) => {
    const normalized = path.replace(/^\.\//, '');
    const src = images[normalized];
    if (!src || !/^data:image\/(png|jpeg|webp);base64,/.test(src)) throw new Error(`Missing or unsupported figure: ${path}. Include the images in the Mathpix ZIP.`);
    return token(`<img src="${src}" alt="${escapeHtml(alt || 'Imported question figure')}" style="max-width:100%;height:auto" />`);
  });
  // Keep layout in ordinary HTML: the shared sanitizer removes MathJax's
  // custom container. Inline TeX supplies the bank's compact fraction size;
  // a separate paragraph supplies standalone alignment and spacing.
  text = text.replace(/(?<!\\)\$\$((?:\\[\s\S]|[^$\\]|\$(?!\$))*?)\$\$|(?<!\\)\$((?:\\[\s\S]|[^$\\])+)\$/g, (_, block, inline) => block !== undefined
    ? token(`<p style="text-align:${options.equationAlign ?? 'center'};margin:0.75em 0">\\(${escapeHtml(block.trim())}\\)</p>`, true)
    : token(`\\(${escapeHtml(inline)}\\)`));
  text = text.replace(/\\\$/g, () => token('&#36;'));
  if (/\\(?:begin|end|section|item)\b/.test(text) || text.includes('$')) throw new Error('Unsupported or incomplete Mathpix markup. Review the export before continuing.');
  let html = text.split(/\n\s*\n/).filter(p => p.trim()).map(p => blocks.has(p.trim()) ? p.trim() : `<p>${escapeHtml(p.trim()).replace(/\n/g, ' ')}</p>`).join('');
  html = html.replace(/IMPORTTOKEN(\d+)END/g, (_, i) => tokens[Number(i)]);
  return html;
}

export function matchIdentifiers<T extends { source_id: string | null; source_external_id: string | null }>(question: { id: string; metadata: ImportMetadata }, rows: T[]) {
  const ids = new Set([question.id, question.metadata.external_id, question.metadata.ibn].filter(Boolean));
  return rows.filter(r => ids.has(r.source_id) || ids.has(r.source_external_id));
}
