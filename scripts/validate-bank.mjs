#!/usr/bin/env node
// scripts/validate-bank.mjs — re-runnable quality gate over the
// published question bank (upgrade plan §1.8).
//
// Validates every published question (is_published AND NOT is_broken AND
// deleted_at IS NULL):
//   - taxonomy   : domain_code AND skill_code present
//   - mcq_key    : exactly one keyed option (correct_answer.option_label,
//                  or a single-entry option_labels) and >= 2 options
//   - spr_value  : a usable accepted value (correct_answer.text or .number)
//   - math       : all math renders under the live renderer
//                  (lib/content/render-math.mjs). NOTE: the plan says
//                  "KaTeX", but the bank actually renders via MathJax
//                  through that module — this reuses the real renderer so
//                  the check matches what students see.
//   - figures    : every <img> in the stem/stimulus has a non-empty src
//
// Quarantine is via questions_v2.is_broken — the REAL mechanism
// (lib/practice/broken-actions.js reads it). The plan named
// question_availability, but that is a 127-row aggregate ROLLUP with no
// per-question flag and no code consumers (verified 2026-07-13), so it
// cannot quarantine an individual question. Nothing is ever deleted.
//
// Usage:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/validate-bank.mjs [--quarantine] [--batch=N] [--limit=N] [--json]
//
//   (default)      report-only — prints a summary + every failure, writes nothing
//   --quarantine   set is_broken=true on failing questions (additive, reversible)
//   --json         emit machine-readable JSON instead of the text report
//   --batch=N      rows per page (default 200)
//   --limit=N      stop after N questions (default: all)

import { createClient } from '@supabase/supabase-js';
import { safeRender } from '../lib/content/render-math.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a === '--quarantine') return ['quarantine', true];
    if (a === '--json') return ['json', true];
    const m = a.match(/^--([a-z-]+)=(.+)$/);
    return m ? [m[1], m[2]] : [a, true];
  }),
);

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(2);
}

const BATCH = Number(args.batch ?? 200);
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Per-check helpers (mirror the SQL integrity checks) ──────────────

function checkTaxonomy(q) {
  return q.domain_code && q.skill_code ? null : 'taxonomy: missing domain_code/skill_code';
}

function checkMcqKey(q) {
  if (q.question_type !== 'mcq') return null;
  const ca = q.correct_answer ?? {};
  const labels = Array.isArray(ca.option_labels) ? ca.option_labels : [];
  const single = typeof ca.option_label === 'string' && ca.option_label.length > 0;
  const keyCount = single ? 1 : labels.length;
  const nOptions = Array.isArray(q.options) ? q.options.length : 0;
  if (keyCount === 0) return 'mcq_key: no keyed option';
  if (keyCount > 1) return `mcq_key: ${keyCount} keys (expected exactly 1)`;
  if (nOptions < 2) return `mcq_key: ${nOptions} options (expected >= 2)`;
  return null;
}

function checkSprValue(q) {
  if (q.question_type !== 'spr') return null;
  const ca = q.correct_answer ?? {};
  const hasText = ca.text != null && String(ca.text).length > 0;
  const hasNumber = ca.number != null;
  return hasText || hasNumber ? null : 'spr_value: no accepted text or number';
}

function checkFigures(q) {
  const html = `${q.stem_html ?? ''}\n${q.stimulus_html ?? ''}`;
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of imgs) {
    const src = tag.match(/\bsrc\s*=\s*["']([^"']*)["']/i);
    if (!src || !src[1].trim()) return 'figures: <img> with missing/empty src';
  }
  return null;
}

// The live renderer (MathJax) THROWS only rarely; unparseable math
// (mismatched delimiters/braces) is instead left in the output with its
// TeX delimiters intact. So flag a field when rendering either throws OR
// leaves \( \) \[ \] behind. (Limitation: an *undefined* TeX command
// renders as a red error node with delimiters consumed, so it isn't
// caught here — the common real defect is unbalanced delimiters, which
// this does catch.)
const TEX_DELIMS = /\\\(|\\\)|\\\[|\\\]/;

function checkMath(q) {
  const optionHtml = Array.isArray(q.options)
    ? q.options.map((o) => (o && typeof o === 'object' ? o.content_html : null))
    : [];
  const fields = [q.stem_html, q.stimulus_html, q.rationale_html, ...optionHtml].filter(Boolean);
  const problems = new Set();
  for (const html of fields) {
    const rendered = safeRender(html, 'math', (_label, err) =>
      problems.add(err?.message ?? String(err)),
    );
    if (TEX_DELIMS.test(rendered)) problems.add('unrendered TeX delimiters remain');
  }
  return problems.size ? `math: ${[...problems].join('; ')}` : null;
}

const CHECKS = [checkTaxonomy, checkMcqKey, checkSprValue, checkFigures, checkMath];

// ── Sweep ────────────────────────────────────────────────────────────

async function main() {
  const failures = [];
  let scanned = 0;
  let from = 0;

  for (;;) {
    if (scanned >= LIMIT) break;
    const to = from + BATCH - 1;
    const { data, error } = await supabase
      .from('questions_v2')
      .select('id, display_code, question_type, stem_html, stimulus_html, rationale_html, options, correct_answer, domain_code, skill_code')
      .eq('is_published', true)
      .eq('is_broken', false)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, to);
    if (error) {
      console.error('Query failed:', error.message);
      process.exit(2);
    }
    if (!data || data.length === 0) break;

    for (const q of data) {
      if (scanned >= LIMIT) break;
      scanned++;
      const reasons = CHECKS.map((c) => c(q)).filter(Boolean);
      if (reasons.length) {
        failures.push({ id: q.id, display_code: q.display_code, reasons });
      }
    }
    if (data.length < BATCH) break;
    from += BATCH;
  }

  const byCategory = {};
  for (const f of failures) {
    for (const r of f.reasons) {
      const cat = r.split(':')[0];
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }
  }

  if (args.json) {
    console.log(JSON.stringify({ scanned, failed: failures.length, byCategory, failures }, null, 2));
  } else {
    console.log(`\nvalidate-bank: scanned ${scanned} published questions`);
    console.log(`failed: ${failures.length}`);
    if (failures.length) {
      console.log('by category:', byCategory);
      console.log('\nFailures:');
      for (const f of failures) {
        console.log(`  ${f.display_code ?? f.id}: ${f.reasons.join(' | ')}`);
      }
    } else {
      console.log('✓ bank clean on all checks.');
    }
  }

  if (args.quarantine && failures.length) {
    const ids = failures.map((f) => f.id);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { error } = await supabase
        .from('questions_v2')
        .update({ is_broken: true })
        .in('id', chunk);
      if (error) {
        console.error('Quarantine update failed:', error.message);
        process.exit(2);
      }
    }
    console.log(`\nQuarantined ${ids.length} question(s) via is_broken=true (reversible; nothing deleted).`);
  } else if (failures.length) {
    console.log('\n(report-only — pass --quarantine to set is_broken on the above.)');
  }

  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
