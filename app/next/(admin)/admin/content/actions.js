// Server Actions for the admin content page. Score conversions,
// routing rules, and skill learnability all route through here.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';

async function adminCtx() {
  return requireRole(['admin']);
}

// ────────────────────────────────────────────────────────────────
// Score conversions
// ────────────────────────────────────────────────────────────────

export async function addScoreConversions(_prev, formData) {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const testId = formData.get('test_id');
  const testName = formData.get('test_name');
  if (typeof testId !== 'string' || !testId) return actionFail('test_id required');
  if (typeof testName !== 'string' || !testName) return actionFail('test_name required');

  const rwM1 = toInt(formData.get('rw_m1'));
  const rwM2 = toInt(formData.get('rw_m2'));
  const rwScaled = toInt(formData.get('rw_scaled'));
  const mathM1 = toInt(formData.get('math_m1'));
  const mathM2 = toInt(formData.get('math_m2'));
  const mathScaled = toInt(formData.get('math_scaled'));

  const rows = [];
  if (rwM1 != null && rwM2 != null && rwScaled != null) {
    if (rwScaled < 200 || rwScaled > 800) return actionFail('R&W scaled must be 200–800');
    rows.push({ test_id: testId, test_name: testName, section: 'RW', module1_correct: rwM1, module2_correct: rwM2, scaled_score: rwScaled });
  }
  if (mathM1 != null && mathM2 != null && mathScaled != null) {
    if (mathScaled < 200 || mathScaled > 800) return actionFail('Math scaled must be 200–800');
    rows.push({ test_id: testId, test_name: testName, section: 'MATH', module1_correct: mathM1, module2_correct: mathM2, scaled_score: mathScaled });
  }

  if (rows.length === 0) return actionFail('Provide at least one complete R&W or Math row');

  const { error } = await ctx.supabase.from('score_conversion').insert(rows);
  if (error) return actionFail(`Failed: ${error.message}`);

  revalidatePath('/admin/content');
  return actionOk({ inserted: rows.length });
}

export async function deleteScoreConversion(prevOrFD, maybeFD) {
  const formData = maybeFD instanceof FormData ? maybeFD : prevOrFD;
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const id = formData.get('id');
  if (typeof id !== 'string' || !id) return actionFail('id required');

  const { error } = await ctx.supabase.from('score_conversion').delete().eq('id', id);
  if (error) return actionFail(`Failed: ${error.message}`);

  revalidatePath('/admin/content');
  return actionOk({});
}

// ────────────────────────────────────────────────────────────────
// Routing rules — full-replace per practice test
// ────────────────────────────────────────────────────────────────

export async function saveRoutingRules(_prev, formData) {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const testId = formData.get('practice_test_id');
  const rulesJson = formData.get('rules_json');

  if (typeof testId !== 'string' || !testId) return actionFail('practice_test_id required');
  if (typeof rulesJson !== 'string') return actionFail('rules_json required');

  let rules;
  try {
    rules = JSON.parse(rulesJson);
  } catch {
    return actionFail('rules_json must be valid JSON');
  }
  if (!Array.isArray(rules)) return actionFail('rules must be an array');

  for (const r of rules) {
    if (!['RW', 'MATH'].includes(r.subject_code)) return actionFail(`Invalid subject: ${r.subject_code}`);
    if (!['>=', '>', '<=', '<', '=='].includes(r.operator)) return actionFail(`Invalid operator: ${r.operator}`);
    if (!Number.isFinite(r.threshold)) return actionFail('Threshold must be a number');
    if (typeof r.to_route_code !== 'string' || !r.to_route_code) return actionFail('Each rule needs a target route code');
  }

  // Replace: delete existing, insert new.
  const { error: delErr } = await ctx.supabase
    .from('practice_test_routing_rules')
    .delete()
    .eq('practice_test_id', testId);
  if (delErr) return actionFail(`Delete failed: ${delErr.message}`);

  if (rules.length > 0) {
    const rows = rules.map((r) => ({
      practice_test_id: testId,
      subject_code: r.subject_code,
      from_module_number: r.from_module_number || 1,
      metric: r.metric || 'correct_count',
      operator: r.operator,
      threshold: r.threshold,
      to_route_code: r.to_route_code,
    }));
    const { error: insErr } = await ctx.supabase
      .from('practice_test_routing_rules')
      .insert(rows);
    if (insErr) return actionFail(`Insert failed: ${insErr.message}`);
  }

  revalidatePath('/admin/content');
  return actionOk({ count: rules.length });
}

// ────────────────────────────────────────────────────────────────
// Skill learnability — batch upsert
// ────────────────────────────────────────────────────────────────

export async function saveSkillLearnability(_prev, formData) {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const changesJson = formData.get('changes_json');
  if (typeof changesJson !== 'string') return actionFail('changes_json required');

  let changes;
  try {
    changes = JSON.parse(changesJson);
  } catch {
    return actionFail('changes_json must be valid JSON');
  }
  if (!Array.isArray(changes) || changes.length === 0) return actionFail('No changes to save');

  for (const c of changes) {
    if (typeof c.skill_code !== 'string' || !c.skill_code) return actionFail('Each change needs a skill_code');
    if (!Number.isInteger(c.learnability) || c.learnability < 1 || c.learnability > 10) {
      return actionFail(`Learnability for ${c.skill_code} must be an integer 1–10`);
    }
  }

  const rows = changes.map((c) => ({
    skill_code: c.skill_code,
    learnability: c.learnability,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await ctx.supabase
    .from('skill_learnability')
    .upsert(rows, { onConflict: 'skill_code' });
  if (error) return actionFail(`Failed: ${error.message}`);

  revalidatePath('/admin/content');
  return actionOk({ count: rows.length });
}

function toInt(v) {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}
