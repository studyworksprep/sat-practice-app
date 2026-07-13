#!/usr/bin/env node
// scripts/audit-content-coverage.mjs — re-runnable content-coverage
// audit (upgrade plan §1.4). Reports, per curriculum unit (§1.2):
//   - published question count (and a content-debt flag)
//   - published questions by difficulty (thin cells matter for drills)
//   - lesson coverage
//
// Deliberately re-runnable (not a dated doc): the prior lesson-builder
// audit rotted into a "KNOWN ERROR", so this stays queryable instead.
//
// Two corrections to the plan's framing, verified against production:
//   - lesson_topics (the plan's lesson→skill join key) is EMPTY (0 rows);
//     real lesson→skill coverage comes from lesson_pack_questions →
//     questions_v2 taxonomy.
//   - "3,381 published" means published AND not-broken AND not-deleted;
//     3,428 rows are is_published=true.
//
// Usage:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/audit-content-coverage.mjs [--min=N] [--json]
//
//   --min=N   content-debt threshold: flag units with < N published
//             questions (default 60)
//   --json    machine-readable output

import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a === '--json') return ['json', true];
    const m = a.match(/^--([a-z-]+)=(.+)$/);
    return m ? [m[1], m[2]] : [a, true];
  }),
);
const MIN = Number(args.min ?? 60);

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(2);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function main() {
  // Curriculum units (the 29 skills).
  const { data: units, error: uErr } = await supabase
    .from('curriculum_units')
    .select('domain_code, skill_code, title, sequence')
    .eq('test_type', 'sat')
    .order('sequence', { ascending: true });
  if (uErr) throw uErr;

  // Published questions (paged) → count per (domain, skill) and per
  // (domain, skill, difficulty).
  const perUnit = new Map();
  const perCell = new Map();
  let from = 0;
  const BATCH = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('questions_v2')
      .select('domain_code, skill_code, difficulty')
      .eq('is_published', true)
      .eq('is_broken', false)
      .is('deleted_at', null)
      .not('domain_code', 'is', null)
      .not('skill_code', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const q of data) {
      const u = `${q.domain_code}/${q.skill_code}`;
      perUnit.set(u, (perUnit.get(u) ?? 0) + 1);
      if (q.difficulty != null) {
        const c = `${u}#${q.difficulty}`;
        perCell.set(c, (perCell.get(c) ?? 0) + 1);
      }
    }
    if (data.length < BATCH) break;
    from += BATCH;
  }

  // Lesson coverage: distinct skills touched by lesson_pack_questions.
  const covered = new Set();
  from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('lesson_pack_questions')
      .select('questions_v2!inner(domain_code, skill_code)')
      .range(from, from + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const q = r.questions_v2;
      if (q?.domain_code && q?.skill_code) covered.add(`${q.domain_code}/${q.skill_code}`);
    }
    if (data.length < BATCH) break;
    from += BATCH;
  }

  const report = units.map((u) => {
    const key = `${u.domain_code}/${u.skill_code}`;
    const n = perUnit.get(key) ?? 0;
    const byDiff = [1, 2, 3].map((d) => perCell.get(`${key}#${d}`) ?? 0);
    return {
      unit: key,
      title: u.title,
      published: n,
      by_difficulty: byDiff,
      thin: n < MIN,
      thin_cells: byDiff.filter((c) => c < 10).length,
      has_lesson: covered.has(key),
    };
  });

  const debt = report.filter((r) => r.thin);
  const noLesson = report.filter((r) => !r.has_lesson);

  if (args.json) {
    console.log(JSON.stringify({ min: MIN, report, debt: debt.map((r) => r.unit), no_lesson: noLesson.map((r) => r.unit) }, null, 2));
    return;
  }

  console.log(`\nContent-coverage audit (published, not-broken, not-deleted) — debt threshold < ${MIN}\n`);
  console.log('unit'.padEnd(10), 'pub'.padStart(4), ' d1/d2/d3'.padEnd(12), 'lesson', ' title');
  for (const r of report) {
    console.log(
      r.unit.padEnd(10),
      String(r.published).padStart(4),
      ` ${r.by_difficulty.join('/')}`.padEnd(12),
      (r.has_lesson ? '  yes ' : '  NO  '),
      (r.thin ? '⚠ ' : '  ') + r.title,
    );
  }
  console.log(`\nContent debt (< ${MIN} published): ${debt.length}/${report.length} units — ${debt.map((r) => `${r.unit}(${r.published})`).join(', ')}`);
  console.log(`No lesson coverage: ${noLesson.length}/${report.length} units — ${noLesson.map((r) => r.unit).join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
