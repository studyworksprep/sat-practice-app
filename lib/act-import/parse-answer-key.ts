// Standalone answer-key parser.
//
// The section parsers in ./parse-questions consume the answer
// key PDF as a second document block alongside the test PDF, so
// they pick up correct answers in-line. This module is the
// standalone tool that gets used when an admin wants to re-pull
// just the key (e.g. to verify before running the section
// parses, or to backfill drafts that landed with no correct
// option marked).
//
// Returns the raw answer-key triples. The caller decides what to
// do with them (e.g. patch existing drafts in
// act_question_drafts).

import type { SupabaseClient } from '@supabase/supabase-js';
import { callClaude, parseClaudeJson } from './anthropic';
import { downloadAsBase64 } from './storage';
import { ANSWER_KEY_SYSTEM } from './prompts';
import type { ActSection } from '@/lib/practice/act-taxonomy';

export interface AnswerKeyEntry {
  section: ActSection;
  source_ordinal: number;
  correct_letter: 'A' | 'B' | 'C' | 'D' | 'E';
  category?: string | null;
  category_code?: string | null;
  subcategory?: string | null;
  subcategory_code?: string | null;
  is_modeling?: boolean | null;
}

export async function parseAnswerKey(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>;
  answerKeyPath: string;
}): Promise<AnswerKeyEntry[]> {
  const pdf = await downloadAsBase64(opts.supabase, opts.answerKeyPath);
  const text = await callClaude({
    system: ANSWER_KEY_SYSTEM,
    userBlocks: [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdf.base64 },
      },
      { type: 'text', text: 'Extract every (section, question_number, correct_letter) row.' },
    ],
    maxTokens: 16000,
  });
  const raw = parseClaudeJson<AnswerKeyEntry[]>(text);
  if (!Array.isArray(raw)) throw new Error('Answer-key parser returned non-array JSON');
  return raw;
}
