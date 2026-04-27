import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/admin/skill-learnability
// Returns all skills (from question_taxonomy) with their learnability ratings.
export const GET = legacyApiRoute(async () => {
  const { supabase } = await requireRole(['manager', 'admin']);

  // Get distinct skills from taxonomy
  const { data: skills, error: skillErr } = await supabase
    .from('question_taxonomy')
    .select('skill_code, skill_name, domain_code, domain_name')
    .not('skill_code', 'is', null);

  if (skillErr) return NextResponse.json({ error: skillErr.message }, { status: 500 });

  // Deduplicate by skill_code, preferring rows that have a skill_name
  const skillMap = {};
  for (const s of skills || []) {
    if (s.skill_code && (!skillMap[s.skill_code] || (!skillMap[s.skill_code].skill_name && s.skill_name))) {
      skillMap[s.skill_code] = {
        skill_code: s.skill_code,
        skill_name: s.skill_name || s.skill_code,
        domain_code: s.domain_code,
        domain_name: s.domain_name,
      };
    }
  }

  // Get existing learnability ratings
  const { data: ratings } = await supabase
    .from('skill_learnability')
    .select('skill_code, learnability');

  const ratingMap = {};
  for (const r of ratings || []) ratingMap[r.skill_code] = r.learnability;

  const result = Object.values(skillMap)
    .map(s => ({ ...s, learnability: ratingMap[s.skill_code] ?? 5 }))
    .sort((a, b) => (a.domain_name || '').localeCompare(b.domain_name || '') || (a.skill_name || '').localeCompare(b.skill_name || ''));

  return NextResponse.json({ skills: result });
});

// POST /api/admin/skill-learnability
// Body: { updates: [{ skill_code, learnability }] }
export const POST = legacyApiRoute(async (request) => {
  const { supabase } = await requireRole(['manager', 'admin']);

  const body = await request.json().catch(() => ({}));
  const updates = body?.updates;
  if (!Array.isArray(updates) || !updates.length) {
    return NextResponse.json({ error: 'updates array required' }, { status: 400 });
  }

  const rows = updates
    .filter(u => u.skill_code && typeof u.learnability === 'number' && u.learnability >= 1 && u.learnability <= 10)
    .map(u => ({
      skill_code: u.skill_code,
      learnability: Math.round(u.learnability),
      updated_at: new Date().toISOString(),
    }));

  if (!rows.length) {
    return NextResponse.json({ error: 'No valid updates' }, { status: 400 });
  }

  const { error } = await supabase
    .from('skill_learnability')
    .upsert(rows, { onConflict: 'skill_code' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, saved: rows.length });
});
