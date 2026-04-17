'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(len = 6) {
  const arr = new Uint8Array(len);
  globalThis.crypto.getRandomValues(arr);
  return Array.from(arr, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

async function adminCtx() {
  return requireRole(['admin']);
}

export async function createTeacherCode(_prev, formData) {
  try {
    const ctx = await adminCtx();
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
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail(err?.message ?? 'Unexpected error creating code');
  }
}

export async function revokeTeacherCode(_prev, formData) {
  try {
    const ctx = await adminCtx();
    const id = formData.get('id');
    if (typeof id !== 'string' || !id) return actionFail('id required');

    const { error } = await ctx.supabase
      .from('teacher_codes')
      .delete()
      .eq('id', id);

    if (error) return actionFail(`Failed: ${error.message}`);
    revalidatePath('/admin/users/codes');
    return actionOk({});
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail(err?.message ?? 'Unexpected error revoking code');
  }
}

export async function setTeacherInviteCode(_prev, formData) {
  try {
    const ctx = await adminCtx();
    const teacherId = formData.get('teacher_id');
    if (typeof teacherId !== 'string' || !teacherId) return actionFail('teacher_id required');

    const raw = formData.get('code');
    const code = ((typeof raw === 'string' && raw.trim()) || generateCode()).toUpperCase();

    if (code.length < 4) return actionFail('Code must be at least 4 characters');

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
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail(err?.message ?? 'Unexpected error setting invite code');
  }
}

export async function clearTeacherInviteCode(_prev, formData) {
  try {
    const ctx = await adminCtx();
    const teacherId = formData.get('teacher_id');
    if (typeof teacherId !== 'string' || !teacherId) return actionFail('teacher_id required');

    const { error } = await ctx.supabase
      .from('profiles')
      .update({ teacher_invite_code: null })
      .eq('id', teacherId);

    if (error) return actionFail(`Failed: ${error.message}`);
    revalidatePath('/admin/users/codes');
    return actionOk({});
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail(err?.message ?? 'Unexpected error clearing invite code');
  }
}
