// Admin · Lessons — §3.5 content-efficacy refresh.
//
// refresh_feature_efficacy() recomputes the feature_efficacy table
// (per lesson×skill pre/post first-attempt accuracy around lesson
// completion). The function is SECURITY DEFINER and granted to
// service_role only — the item_stats pattern — so the admin-triggered
// refresh goes through requireServiceRole with an audited reason.
// pg_cron isn't installed yet; when the nightly snapshot job gets
// scheduled, chain this refresh onto it and this button becomes a
// convenience rather than the only trigger.

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireServiceRole } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/response';

export async function refreshEfficacy(): Promise<void> {
  let service;
  try {
    ({ service } = await requireServiceRole(
      'refresh feature_efficacy aggregates (admin lessons page)',
      { allowedRoles: ['admin'] },
    ));
  } catch (err) {
    if (err instanceof ApiError) redirect('/admin');
    throw err;
  }

  const { error } = await service.rpc('refresh_feature_efficacy');
  revalidatePath('/admin/lessons');
  redirect(error
    ? `/admin/lessons?efficacy_error=${encodeURIComponent(error.message)}`
    : '/admin/lessons?efficacy=1');
}
