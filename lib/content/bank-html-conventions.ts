// Shared storage conventions for authored and normalized question content.
export type BankFieldKind = 'stem' | 'stimulus' | 'rationale' | 'option';

export const BANK_TABLE_CLASS = 'stimulus_table';

export function bankParagraphTag(kind: BankFieldKind, centered = false): string {
  const className = kind === 'stem' || kind === 'stimulus' ? ` class="${kind}_paragraph"` : '';
  const alignment = centered ? ' style="text-align:center;"' : '';
  return `<p${className}${alignment}>`;
}
