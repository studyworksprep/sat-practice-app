// Scale-conversion parser.
//
// Unlike the question parsers, this one writes its output
// directly to public.act_score_conversion under the job's
// source_test — that table is reference data with no draft /
// review stage. The Server Action wrapper still records a log
// entry and updates job.scale_status, but no draft rows are
// produced.
//
// Upsert key is (source_test, section, raw_score) per the table's
// primary key; rerunning the parse on the same job is a no-op
// for unchanged rows and an update where Claude refined a value.
// Each section the parse returns is then trimmed to exactly the
// raw scores it returned, so a re-import replaces that section's
// table rather than leaving a stale tail behind (a first pass that
// only saw part of a form produced a table sized to what parsed,
// not to the official scale).

import type { SupabaseClient } from '@supabase/supabase-js';
import { callClaude, parseClaudeJson } from './anthropic';
import { downloadAsBase64 } from './storage';
import { SCALE_SYSTEM } from './prompts';
import type { ActSection } from '@/lib/practice/act-taxonomy';

export interface ScaleEntry {
  section: ActSection;
  raw_score: number;
  scaled_score: number;
}

export interface ParseScaleResult {
  inserted: number;
  /** Rows of a parsed section that the parse did not return and were
   *  deleted so the section matches the new table. */
  removed: number;
  warnings: string[];
}

export async function parseScale(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>;
  scalePath: string;
  sourceTest: string;
}): Promise<ParseScaleResult> {
  const pdf = await downloadAsBase64(opts.supabase, opts.scalePath);
  const text = await callClaude({
    system: SCALE_SYSTEM,
    userBlocks: [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdf.base64 },
      },
      {
        type: 'text',
        text: `Extract the raw → scaled conversion for source test "${opts.sourceTest}". Emit one row per (section, raw_score).`,
      },
    ],
    maxTokens: 16000,
  });

  const raw = parseClaudeJson<ScaleEntry[]>(text);
  if (!Array.isArray(raw)) throw new Error('Scale parser returned non-array JSON');

  const warnings: string[] = [];
  const rows = raw
    .filter((r) => {
      if (!['english', 'math', 'reading', 'science'].includes(r.section)) {
        warnings.push(`Skipped row: bad section "${r.section}"`);
        return false;
      }
      if (
        !Number.isInteger(r.raw_score) ||
        r.raw_score < 0 ||
        r.raw_score > 100 ||
        !Number.isInteger(r.scaled_score) ||
        r.scaled_score < 1 ||
        r.scaled_score > 36
      ) {
        warnings.push(
          `Skipped row: out-of-range raw=${r.raw_score} scaled=${r.scaled_score} on ${r.section}`,
        );
        return false;
      }
      return true;
    })
    .map((r) => ({
      source_test: opts.sourceTest,
      section: r.section,
      raw_score: r.raw_score,
      scaled_score: r.scaled_score,
    }));

  if (rows.length === 0) {
    return { inserted: 0, removed: 0, warnings: warnings.concat(['No valid rows parsed from scale PDF.']) };
  }

  const { error } = await opts.supabase
    .from('act_score_conversion')
    .upsert(rows, { onConflict: 'source_test,section,raw_score' });
  if (error) {
    throw new Error(`Could not upsert scale rows: ${error.message}`);
  }

  // Replace semantics per parsed section: anything this parse didn't
  // return for a section it did cover is stale. Sections the parse
  // skipped entirely are left alone.
  const rawsBySection = new Map<string, number[]>();
  for (const r of rows) {
    const arr = rawsBySection.get(r.section) ?? [];
    arr.push(r.raw_score);
    rawsBySection.set(r.section, arr);
  }
  let removed = 0;
  for (const [section, raws] of rawsBySection) {
    const { data: gone, error: delErr } = await opts.supabase
      .from('act_score_conversion')
      .delete()
      .eq('source_test', opts.sourceTest)
      .eq('section', section)
      .not('raw_score', 'in', `(${raws.join(',')})`)
      .select('raw_score');
    if (delErr) {
      warnings.push(`Could not remove stale ${section} rows: ${delErr.message}`);
      continue;
    }
    removed += (gone ?? []).length;
  }

  return { inserted: rows.length, removed, warnings };
}
