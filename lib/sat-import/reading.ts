import { sectionFromDomain } from './section.ts';

/** Split only recognized reading exports; never guess a boundary in a math item. */
export function splitReadingQuestion(text: string, domain?: string | null) {
  if (sectionFromDomain(domain) !== 'RW') return { stimulus: null, stem: text };
  // Mathpix retains the question as its final paragraph. These anchored starts
  // also retain qualifiers such as "Assuming..." and "Based on the texts...".
  const starts = [...text.matchAll(/^(?:Which\b|Based on the texts?\b|According to\b|As used in the text\b|Assuming\b|Information in the text\b|Taken together\b|What\b|How\b|The student wants\b|A student wants\b)[^\n]*/gm)];
  const goal = starts.filter(m => /^(?:The|A) student wants\b/.test(m[0])).at(-1);
  const boundary = goal ?? starts.at(-1);
  if (!boundary || !text.slice(boundary.index).trim().endsWith('?')) {
    throw new Error('Cannot identify the reading question prompt. Put the prompt (including any student goal) on a separate line and compare again.');
  }
  const stimulus = text.slice(0, boundary.index).trim();
  const stem = text.slice(boundary.index).trim();
  if (!stimulus) throw new Error('Reading question has no separate passage or notes. Review the export before importing.');
  return { stimulus, stem };
}
