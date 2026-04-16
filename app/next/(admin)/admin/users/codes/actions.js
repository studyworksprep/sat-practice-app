// Server Actions for admin → users → codes.
// Two kinds of codes are managed here:
//
// 1) teacher_codes — admin-created bulk signup tokens. A row in
//    public.teacher_codes is "available" until consumed at signup,
//    after which used_by/used_at populate.
//
// 2) profiles.teacher_invite_code — per-teacher personal code used
//    by students at signup to auto-assign to that teacher.

'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';

// 6 chars, no ambiguous shapes (0/O, 1/I/L removed)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(len = 6) {
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

async function adminCtx() {
  return requireRole(['admin']);
}

export async function createTeacherCode(_prev, formData) {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const raw = formData.get('code');
  const code = ((typeof raw === 'string' && raw.trim()) || generateCode()).toUpperCase();

  if (code.length < 4) return actionFail('Code must be at least 4 characters');

  const { error } = await ctx.supabase
    .from('teacher_codes')
    .insert({ code });

  if (error) {
    if (error.code === '23505') return actionFail('That code already exists');
    return actionFail(`Failed: ${error.message}`);
  }

  revalidatePath('/admin/users/codes');
  return actionOk({ code });
}

export async function revokeTeacherCode(_prev, formData) {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const id = formData.get('id');
  if (typeof id !== 'string' || !id) return actionFail('id required');

  const { error } = await ctx.supabase
    .from('teacher_codes')
    .delete()
    .eq('id', id);

  if (error) return actionFail(`Failed: ${error.message}`);
  revalidatePath('/admin/users/codes');
  return actionOk({});
}

export async function setTeacherInviteCode(_prev, formData) {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const teacherId = formData.get('teacher_id');
  if (typeof teacherId !== 'string' || !teacherId) return actionFail('teacher_id required');

  const raw = formData.get('code');
  const code = ((typeof raw === 'string' && raw.trim()) || generateCode()).toUpperCase();

  if (code.length < 4) return actionFail('Code must be at least 4 characters');

  // Uniqueness check — the column is UNIQUE so the DB will also reject,
  // but we want a clean error message.
  const { data: existing } = await ctx.supabase
    .from('profiles')
    .select('id')
    .eq('teacher_invite_code', code)
    .neq('id', teacherId)
    .maybeSingle();

  if (existing) return actionFail('That code is already in use by another teacher');

  const { error } = await ctx.supabase
    .from('profiles')
    .update({ teacher_invite_code: code })
    .eq('id', teacherId);

  if (error) return actionFail(`Failed: ${error.message}`);
  revalidatePath('/admin/users/codes');
  return actionOk({ code });
}

export async function clearTeacherInviteCode(_prev, formData) {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const teacherId = formData.get('teacher_id');
  if (typeof teacherId !== 'string' || !teacherId) return actionFail('teacher_id required');

  const { error } = await ctx.supabase
    .from('profiles')
    .update({ teacher_invite_code: null })
    .eq('id', teacherId);

  if (error) return actionFail(`Failed: ${error.message}`);
  revalidatePath('/admin/users/codes');
  return actionOk({});
}
