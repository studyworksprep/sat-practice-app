export interface ActOption {
  label: string;
  content_html: string;
  is_correct: boolean;
}

/** Keep the answer flag on its content while closing any gap in the labels. */
function relabelOption<T extends ActOption>(option: T, label: string): T {
  if (option.label === label) return option;
  let content = option.content_html;
  for (const oldAlt of [`Original graph option ${option.label}`, `Graph option ${option.label}`]) {
    content = content
      .replaceAll(`alt="${oldAlt}"`, `alt="Graph option ${label}"`)
      .replaceAll(`alt='${oldAlt}'`, `alt='Graph option ${label}'`);
  }
  return {
    ...option,
    label,
    content_html: content,
  };
}

/** Invalid keys stay intact for review; never guess which answer is correct. */
export function normalizeMathOptions<T extends ActOption>(
  section: string,
  options: T[],
  random: () => number = Math.random,
): T[] {
  if (section !== 'math' || options.length !== 5 || options.filter(o => o.is_correct).length !== 1) {
    return options;
  }

  const wrongIndices = options.flatMap((o, i) => o.is_correct ? [] : [i]);
  const removedIndex = wrongIndices[Math.floor(random() * wrongIndices.length)];
  return options.filter((_, i) => i !== removedIndex).map((o, i) => relabelOption(o, 'ABCD'[i]));
}

/** Read the source key before reducing legacy Math to the bank's four choices. */
export function optionsFromParsedQuestion(
  section: string,
  options: Array<Partial<ActOption>>,
  random: () => number = Math.random,
): ActOption[] {
  const legacyLabels: Record<string, string> = { F: 'A', G: 'B', H: 'C', J: 'D', K: 'E' };
  const labeled = options.map((o, i) => relabelOption({
    label: o.label ?? String.fromCharCode(65 + i),
    content_html: o.content_html ?? '',
    is_correct: Boolean(o.is_correct),
  }, legacyLabels[o.label ?? ''] ?? o.label ?? String.fromCharCode(65 + i)));
  return normalizeMathOptions(section, labeled, random);
}
