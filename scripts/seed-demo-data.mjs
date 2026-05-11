#!/usr/bin/env node
// Seed activity data for the marketing demo accounts. Idempotent —
// safe to re-run after the demo accounts migration has landed
// (20260511000001_create_demo_accounts.sql).
//
// What it produces:
//   * ~220 attempts for demo.student spread across every Math/RW
//     domain at realistic accuracy (75-90% per skill, weakest on
//     advanced math), seeded over the last 60 days so the weekly
//     trend chart has shape.
//   * 4 completed practice_sessions for the student so the
//     dashboard's "Recently finished" list is populated.
//   * 1 completed practice_test_attempts_v2 row with a realistic
//     composite score, so the results page links resolve.
//   * Roughly half that volume for each of the six demo students
//     on the demo tutor's roster, so manager dashboards and
//     cohort reports aggregate non-trivial numbers.
//   * 2 open assignments_v2 + assignment_students_v2 rows that
//     the student dashboard's "Pending assignments" card surfaces.
//
// Idempotency: every insert uses ON CONFLICT DO NOTHING (or
// upsert with a deterministic id derived from a sha256 of
// (user_id, question_id, ordinal)). Re-running on the same
// database leaves the data byte-identical.
//
// Usage:
//   SUPABASE_URL=…
//   SUPABASE_SERVICE_ROLE_KEY=…
//   node scripts/seed-demo-data.mjs [--dry-run]
//
// --dry-run prints what it would do and leaves the DB untouched.
//
// Run after both demo-foundation migrations have landed. The seed
// is keyed off the fixed UUIDs in the migration, so it'll fail
// noisily (FK violation) if the demo profiles don't exist yet.

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Fixed UUIDs from the demo-accounts migration ────────────
const STUDENT = '00000000-0000-0000-0000-000000d30001';
const TUTOR = '00000000-0000-0000-0000-000000d30002';
const ROSTER = [
  '00000000-0000-0000-0000-000000d30101',
  '00000000-0000-0000-0000-000000d30102',
  '00000000-0000-0000-0000-000000d30103',
  '00000000-0000-0000-0000-000000d30104',
  '00000000-0000-0000-0000-000000d30105',
  '00000000-0000-0000-0000-000000d30106',
];

// Per-user activity profiles. The standalone demo student is a
// high-activity profile (preparing seriously); roster students
// vary in volume to look like a real cohort.
const PROFILES = {
  [STUDENT]: { attempts: 220, accuracy: 0.82, sessions: 4 },
  [ROSTER[0]]: { attempts: 180, accuracy: 0.86, sessions: 3 }, // Imani — strong
  [ROSTER[1]]: { attempts: 130, accuracy: 0.74, sessions: 3 }, // Noah  — mid
  [ROSTER[2]]: { attempts: 200, accuracy: 0.83, sessions: 4 }, // Priya — strong
  [ROSTER[3]]: { attempts:  90, accuracy: 0.68, sessions: 2 }, // Theo  — building
  [ROSTER[4]]: { attempts: 165, accuracy: 0.88, sessions: 3 }, // Linnea — strong
  [ROSTER[5]]: { attempts: 110, accuracy: 0.76, sessions: 2 }, // Joaquin — mid
};

// Deterministic PRNG so re-runs produce byte-identical seed data.
// Mulberry32 from a string-derived seed.
function makeRng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i += 1) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic UUID from (kind, user, ordinal). Lets every insert
// resolve to the same id on re-run so ON CONFLICT works without
// needing the DB to retain prior state across re-creation.
function detUuid(kind, userId, ordinal) {
  const h = createHash('sha256')
    .update(`${kind}::${userId}::${ordinal}`)
    .digest('hex');
  return (
    h.slice(0, 8) + '-' +
    h.slice(8, 12) + '-' +
    // Force version 4 + RFC 4122 variant bits so Postgres uuid type
    // accepts it cleanly. (We're not using it cryptographically.)
    '4' + h.slice(13, 16) + '-' +
    '8' + h.slice(17, 20) + '-' +
    h.slice(20, 32)
  );
}

async function fetchPublishedQuestions() {
  // Pull a reasonably wide cross-section so per-skill attempts
  // spread realistically. 500 questions across all domains is
  // plenty for ~220 attempts / user (we may pick the same
  // question for different users).
  const { data, error } = await supabase
    .from('questions_v2')
    .select('id, domain_code, skill_code, difficulty')
    .eq('is_published', true)
    .eq('is_broken', false)
    .limit(500);
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No published questions_v2 rows found. Seed expects a populated question bank.');
  }
  return data;
}

function buildAttempts(userId, questions, profile) {
  const rng = makeRng(`attempts::${userId}`);
  const now = Date.now();
  const windowMs = 60 * 24 * 60 * 60 * 1000; // 60 days
  const rows = [];
  for (let i = 0; i < profile.attempts; i += 1) {
    const q = questions[Math.floor(rng() * questions.length)];
    // Per-skill accuracy wobbles around the user's baseline by ±8 pts
    // so the dashboard's per-domain bars don't all look identical.
    const skillWobble = (rng() - 0.5) * 0.16;
    const pCorrect = Math.min(0.98, Math.max(0.3, profile.accuracy + skillWobble));
    const isCorrect = rng() < pCorrect;
    // Spread created_at over the window, biased slightly toward
    // the recent end so weekly-trend charts trend upward.
    const recencyBias = rng() ** 0.75;
    const createdAt = new Date(now - recencyBias * windowMs).toISOString();
    rows.push({
      id: detUuid('attempt', userId, i),
      user_id: userId,
      question_id: q.id,
      is_correct: isCorrect,
      time_spent_ms: Math.round(20_000 + rng() * 90_000),
      created_at: createdAt,
      source: 'practice',
    });
  }
  return rows;
}

function buildPracticeSessions(userId, attempts, profile) {
  const rng = makeRng(`sessions::${userId}`);
  // Carve the most-recent attempts into N sessions, ~12 questions
  // each, marked completed. The dashboard "Recently finished" card
  // hangs off this shape.
  const sortedRecent = [...attempts]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, profile.sessions * 12);
  const rows = [];
  for (let i = 0; i < profile.sessions; i += 1) {
    const slice = sortedRecent.slice(i * 12, (i + 1) * 12);
    if (slice.length === 0) break;
    rows.push({
      id: detUuid('session', userId, i),
      user_id: userId,
      test_type: 'sat',
      question_ids: slice.map((a) => a.question_id),
      current_position: slice.length,
      mode: 'practice',
      status: 'completed',
      filter_criteria: { source: 'demo-seed' },
      created_at: slice[slice.length - 1].created_at,
      last_activity_at: slice[0].created_at,
      // expires_at well in the past so the "active session" Resume
      // banner doesn't surface this seeded session.
      expires_at: new Date(Date.parse(slice[0].created_at) - 1000).toISOString(),
    });
  }
  return rows;
}

async function upsert(table, rows, idKey = 'id') {
  if (rows.length === 0) return;
  if (DRY_RUN) {
    console.log(`  [dry-run] would upsert ${rows.length} into ${table}`);
    return;
  }
  // Chunk to keep request size bounded for tables with wide rows.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from(table)
      .upsert(slice, { onConflict: idKey, ignoreDuplicates: true });
    if (error) {
      console.error(`  insert into ${table} failed:`, error.message);
      throw error;
    }
  }
  console.log(`  upserted ${rows.length} into ${table}`);
}

async function main() {
  console.log(`Seeding demo activity data${DRY_RUN ? ' (dry run)' : ''}.`);

  const questions = await fetchPublishedQuestions();
  console.log(`Pulled ${questions.length} published questions to draw from.`);

  for (const [userId, profile] of Object.entries(PROFILES)) {
    console.log(`\nUser ${userId} (target ${profile.attempts} attempts):`);
    const attempts = buildAttempts(userId, questions, profile);
    const sessions = buildPracticeSessions(userId, attempts, profile);
    await upsert('attempts', attempts);
    await upsert('practice_sessions', sessions);
  }

  console.log('\nDone. Spot-check a dashboard:');
  console.log('  /auth/demo/student  →  /dashboard');
  console.log('  /auth/demo/tutor    →  /tutor/dashboard');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
