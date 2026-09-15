import {sectionFromDomain} from './section.ts';
export type ImportChoice = {
  preference: 'Keep existing' | 'Prefer imported' | 'Needs editing' | '';
  matchId: string | null;
  confirmed: boolean;
  stimulusIncluded: boolean;
  selected: boolean;
  destination: 'supplemental' | 'regular';
  batchId: string;
  publish: boolean;
  section: 'M' | 'RW' | '';
};
export type ImportOutcome = { status: 'running' | 'success' | 'error' | 'kept'; message: string; recordId?: string };
export type QueueItem = {
  id: string; insertToken: string | null; hasAnswer: boolean; difficulty: number | null;
  imported: { question: { taxonomy: { domain_name: string | null; skill_name: string | null } } };
  matches: Array<{ id: string; applyToken: string | null; applyBlocked: string | null; requiresStimulusConfirmation?: boolean }>;
};
export function initialChoice(batchId = ''): ImportChoice {
  return { preference: '', matchId: null, confirmed: false, stimulusIncluded: false, selected: false, destination: 'supplemental', batchId, publish: false, section: '' };
}
export function completed(outcome?: ImportOutcome) { return outcome?.status === 'success' || outcome?.status === 'kept'; }
export function readiness(item: QueueItem, choice: ImportChoice, outcome?: ImportOutcome): string | null {
  if (completed(outcome)) return 'Already completed.';
  if (!choice.preference) return 'Choose which rendering to keep.';
  if (choice.preference === 'Needs editing') return 'Resolve the editing issues before importing.';
  if (item.matches.length) {
    const match = item.matches.find(m => m.id === choice.matchId);
    if (!match) return 'Choose the existing question to compare.';
    if (choice.preference === 'Prefer imported' && !match.applyToken) return match.applyBlocked || 'This replacement is unavailable. Compare again.';
    if (choice.preference === 'Prefer imported' && match.requiresStimulusConfirmation && !choice.stimulusIncluded) return 'Confirm that the imported prompt includes all stimulus content.';
  } else {
    if (choice.preference !== 'Prefer imported') return 'Choose the imported rendering for a new question.';
    if (!item.insertToken) return 'This question cannot be inserted from this comparison.';
    if (choice.destination === 'supplemental' && !choice.batchId) return 'Choose a supplemental set.';
    if (choice.destination === 'regular' && (!item.difficulty || !item.imported.question.taxonomy.domain_name || !item.imported.question.taxonomy.skill_name)) return 'Topic and difficulty metadata are required for the regular bank. Choose a supplemental set instead.';
    if (!sectionFromDomain(item.imported.question.taxonomy.domain_name) && !choice.section) return 'Choose Math or Reading & Writing for the new question ID.';
    if (choice.publish && !item.hasAnswer) return 'An answer is required for publication. Save this question as a draft.';
  }
  if (!choice.confirmed) return 'Confirm that you reviewed this question.';
  return null;
}
export function queueProblem(items: QueueItem[], choices: Record<string, ImportChoice>, outcomes: Record<string, ImportOutcome>): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    const choice = choices[item.id] ?? initialChoice();
    const reason = readiness(item, choice, outcomes[item.id]);
    if (reason) return `${item.id}: ${reason}`;
    if (item.matches.length && choice.matchId) {
      if (seen.has(choice.matchId)) return 'Two selected imports refer to the same bank question. Select only one of them.';
      seen.add(choice.matchId);
    }
  }
  return null;
}
