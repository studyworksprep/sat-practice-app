// Creates an isolated development student; never mutates an existing
// student's plans and always removes the fixture account afterward.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { test, expect, type Page } from '@playwright/test';

const local = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
function env(name: string) {
  return process.env[name] ?? local.split('\n').find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1).replace(/^["']|["']$/g, '');
}
const url = env('NEXT_PUBLIC_SUPABASE_URL');
const key = env('SUPABASE_SERVICE_ROLE_KEY');
const development = url === 'https://ikzhizgsawzjpuuznfid.supabase.co';
const password = `PlanEditor-${randomUUID()}`;
const email = `plan-editor-${randomUUID()}@test.studyworks`;
const teacher = '22222222-2222-2222-2222-222222222222';

function draftSection(page: Page) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: 'Draft plan', exact: true }) });
}

test('tutor builds and edits units/tasks, regeneration preserves decisions, student starts assigned practice', async ({ page, browser }, testInfo) => {
  test.setTimeout(240_000);
  test.skip(!development || !key, 'Requires the development database and its fixture key.');
  const db = createClient(url!, key!, { auth: { persistSession: false } });
  let studentId: string | undefined;
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const checked = async <T,>(query: PromiseLike<{ data: T; error: { message: string } | null }>) => {
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    return result.data;
  };
  try {
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    studentId = created.data.user.id;
    await checked(db.from('profiles').update({ role: 'student', first_name: 'Plan Editor Check', subscription_exempt: true }).eq('id', studentId));
    await checked(db.from('teacher_student_assignments').insert({ teacher_id: teacher, student_id: studentId }));
    // Roster membership alone does not grant paid access. The isolated
    // development fixture receives a short-lived manual entitlement.
    await checked(db.from('entitlements').insert({
      user_id: studentId, plan: 'full', source: 'manual', status: 'active',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      note: 'Disposable study-plan browser-test fixture',
    }));
    await checked(db.from('student_intake').upsert({ student_id: studentId, skipped_at: new Date().toISOString() }));
    const route = `/tutor/students/${studentId}/plan`;
    await page.goto(route);
    await page.getByLabel('Target score', { exact: true }).fill('1400');
    const date = new Date(Date.now() + 100 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel('Test date', { exact: true }).fill(date);
    await page.getByRole('button', { name: 'Generate plan', exact: true }).click();
    let draft = draftSection(page);
    await expect(draft.getByRole('heading', { name: 'Draft plan', exact: true })).toBeVisible({ timeout: 45_000 });
    const plan = (await checked(db.from('study_plans').select('id').eq('student_id', studentId).eq('status', 'draft').single()))!;
    // Missing profile targets still have an input. Once a target is saved,
    // the builder uses it instead of the older score on the draft.
    await checked(db.from('profiles').update({ target_sat_score: 1450 }).eq('id', studentId));
    await page.reload();
    await expect(page.getByLabel('Target score', { exact: true })).toHaveCount(0);
    await expect(page.getByText('1450 · From student profile')).toBeVisible();
    // A profile edit made after rendering must also be picked up on submit.
    await checked(db.from('profiles').update({ target_sat_score: 1500 }).eq('id', studentId));
    const tasks = async () => (await checked(db.from('plan_tasks').select('id, week_index, scheduled_date, payload, source, status').eq('plan_id', plan.id)))!;
    const initial = await tasks();
    expect(initial.some((t) => t.payload.drill_role === 'mixed')).toBe(true);

    // Remove exactly one generated task, then regenerate its week.
    // The first row's remove control is unambiguous even if titles repeat.
    const firstRemove = draft.getByRole('button', { name: 'Remove task', exact: true }).first();
    await firstRemove.click();
    await expect.poll(async () => (await tasks()).length).toBe(initial.length - 1);
    const afterRemove = await tasks();
    const deleted = initial.find((t) => !afterRemove.some((r) => r.id === t.id))!;
    await draft.getByRole('button', { name: 'Regenerate', exact: true }).first().click();
    await expect.poll(async () => (await tasks()).some((t) => t.payload.generation_key === deleted.payload.generation_key)).toBe(false);
    await expect(draft.getByRole('button', { name: 'Regenerate', exact: true }).first()).toBeEnabled({ timeout: 30_000 });

    // Add a whole unit, move it, and retain its rows through regeneration.
    await draft.getByLabel('Task type', { exact: true }).selectOption('unit');
    const skill = draft.getByLabel('Skill', { exact: true });
    const unitValue = await skill.locator('option').nth(1).getAttribute('value');
    await skill.selectOption(unitValue!);
    await draft.getByLabel('Add to week').selectOption('1');
    await draft.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(async () => (await tasks()).filter((t) => t.payload.editor_unit === true).length).toBeGreaterThan(1);
    const manual = (await tasks()).filter((t) => t.payload.editor_unit === true);
    const unitKey = manual[0].payload.plan_unit_key;
    const unitCard = draft.locator(`[data-unit-key="${unitKey}"]`);
    await unitCard.getByLabel('Move unit to week').selectOption('2');
    await unitCard.getByRole('button', { name: 'Move unit', exact: true }).click();
    await expect.poll(async () => (await tasks()).filter((t) => t.payload.plan_unit_key === unitKey).every((t) => t.week_index === 2)).toBe(true);
    const moved = (await tasks()).filter((t) => t.payload.plan_unit_key === unitKey);
    await page.getByRole('button', { name: 'Regenerate draft', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Regenerate draft', exact: true })).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByText('Draft ready — add or edit work below, then activate it.')).toBeVisible();
    expect((await checked(db.from('study_plans').select('goal_score').eq('id', plan.id).single()))!.goal_score).toBe(1500);
    for (const t of moved) expect((await tasks()).find((r) => r.id === t.id)).toMatchObject({ week_index: t.week_index, scheduled_date: t.scheduled_date, source: 'tutor' });
    expect((await tasks()).some((t) => t.payload.generation_key === deleted.payload.generation_key)).toBe(false);

    // Individual tasks can move out of their unit without moving peers.
    await draft.locator('details').nth(2).locator('summary').click();
    const unitRows = draft.locator(`[data-unit-key="${unitKey}"]`).filter({ has: page.getByRole('button', { name: 'Move unit', exact: true }) });
    await unitRows.getByLabel('Move task to week').first().selectOption('3');
    await expect.poll(async () => (await tasks()).filter((t) => t.payload.plan_unit_key === unitKey && t.week_index === 3).length).toBe(1);
    await unitRows.getByRole('button', { name: 'Remove unit', exact: true }).click();
    await expect.poll(async () => (await tasks()).filter((t) => t.payload.plan_unit_key === unitKey).length).toBe(0);
    const removedSkill = unitValue!.split('|')[1];
    await page.getByRole('button', { name: 'Regenerate draft', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Regenerate draft', exact: true })).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByText('Draft ready — add or edit work below, then activate it.')).toBeVisible();
    expect((await tasks()).some((t) => t.payload.skill_code === removedSkill)).toBe(false);

    await testInfo.attach('Generated study plan', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // Start a genuinely empty draft. It remains a manual plan on rebuild.
    await page.getByLabel('Start from scratch').check();
    await page.getByRole('button', { name: 'Create blank draft', exact: true }).click();
    await expect.poll(async () => (await checked(db.from('study_plans').select('id').eq('student_id', studentId).eq('status', 'draft').single()))?.id).not.toBe(plan.id);
    const blank = (await checked(db.from('study_plans').select('id').eq('student_id', studentId).eq('status', 'draft').single()))!;
    const blankTasks = async () => (await checked(db.from('plan_tasks').select('id, task_type, payload').eq('plan_id', blank.id)))!;
    expect(await blankTasks()).toHaveLength(0);
    draft = draftSection(page);
    await draft.getByLabel('Task type', { exact: true }).selectOption('practice_set');
    await draft.getByLabel('Skill', { exact: true }).selectOption(unitValue!);
    await draft.getByLabel('Questions', { exact: true }).fill('4');
    await draft.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(async () => (await blankTasks()).length).toBe(1);
    expect((await blankTasks())[0].payload.filter_criteria.count).toBe(4);
    await page.getByRole('button', { name: 'Activate this plan', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Active plan', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.evaluate(() => window.scrollTo(0, 0));
    await testInfo.attach('Mobile study plan', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const studentContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const studentPage = await studentContext.newPage();
      await studentPage.goto('/login');
      await studentPage.getByLabel(/email/i).fill(email);
      await studentPage.getByLabel('Password', { exact: true }).fill(password);
      await studentPage.getByRole('button', { name: /^log in$/i }).click();
      await studentPage.waitForURL((u) => !u.pathname.includes('/login'));
      await studentPage.goto('/plan');
      await expect(studentPage.getByText(String((await blankTasks())[0].payload.title), { exact: true }).first()).toBeVisible({ timeout: 30_000 });
      const savedTasks = await checked(db.from('plan_tasks').select('*').eq('plan_id', blank.id).order('id'));
      const beforeProfile = (await checked(db.from('study_plans').select('*').eq('id', blank.id).single()))!;
      // Profile saving updates the existing plan immediately: no Adjust,
      // Rebuild, new draft, or activation is needed, even for a manual plan.
      await studentPage.goto('/account');
      await studentPage.getByLabel('Target SAT score', { exact: true }).fill('1530');
      await studentPage.getByRole('button', { name: 'Save profile', exact: true }).click();
      await expect(studentPage.getByText('Saved.', { exact: true }).first()).toBeVisible();
      const afterProfile = (await checked(db.from('study_plans').select('*').eq('id', blank.id).single()))!;
      expect(afterProfile.goal_score).toBe(1530);
      expect({ ...afterProfile, goal_score: beforeProfile.goal_score, updated_at: beforeProfile.updated_at }).toEqual(beforeProfile);
      expect(await checked(db.from('plan_tasks').select('*').eq('plan_id', blank.id).order('id'))).toEqual(savedTasks);
      await studentPage.goto('/plan');
      await expect(studentPage.getByText('Target 1530', { exact: true })).toBeVisible();
      await studentPage.getByRole('button', { name: 'Change date, hours, or days', exact: true }).click();
      await expect(studentPage.getByLabel('Target score', { exact: true })).toHaveCount(0);
      await expect(studentPage.getByText('1530 · From your profile')).toBeVisible();
      await checked(db.from('profiles').update({ target_sat_score: 1520 }).eq('id', studentId));
      expect((await checked(db.from('study_plans').select('goal_score').eq('id', blank.id).single()))!.goal_score).toBe(1520);
      await studentPage.getByRole('button', { name: 'Save and update my plan', exact: true }).click();
      await expect(studentPage.getByText(/Plan updated —/)).toBeVisible();
      expect((await checked(db.from('study_plans').select('goal_score').eq('id', blank.id).single()))!.goal_score).toBe(1520);
      expect((await checked(db.from('profiles').select('target_sat_score').eq('id', studentId).single()))!.target_sat_score).toBe(1520);

      // Students without a saved target can supply one during adjustment.
      await checked(db.from('profiles').update({ target_sat_score: null }).eq('id', studentId));
      await studentPage.reload();
      await studentPage.getByRole('button', { name: 'Change target, date, hours, or days', exact: true }).click();
      await studentPage.getByLabel('Target score', { exact: true }).fill('1480');
      await studentPage.getByRole('button', { name: 'Save and update my plan', exact: true }).click();
      await expect(studentPage.getByText(/Plan updated —/)).toBeVisible();
      expect((await checked(db.from('profiles').select('target_sat_score').eq('id', studentId).single()))!.target_sat_score).toBe(1480);
      await studentPage.getByRole('button', { name: 'Rebuild from my latest practice', exact: true }).click();
      await expect(studentPage.getByText(/Plan rebuilt/)).toBeVisible();
      expect(await blankTasks()).toHaveLength(1);
      await studentPage.getByRole('button', { name: 'Start', exact: true }).first().click();
      await studentPage.waitForURL(/\/practice\/s\//, { timeout: 30_000 });
      const sessions = await checked(db.from('practice_sessions').select('id, plan_task_id').eq('user_id', studentId));
      expect(sessions!.length).toBeGreaterThan(0);
      expect(sessions![0].plan_task_id).toBe((await blankTasks())[0].id);
    } finally { await studentContext.close(); }
    expect(errors).toEqual([]);
  } finally {
    if (studentId) {
      const removed = await db.auth.admin.deleteUser(studentId);
      if (removed.error) throw removed.error;
    }
  }
});
