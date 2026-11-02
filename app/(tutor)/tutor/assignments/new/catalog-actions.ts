'use server';

import { requireRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';
import { loadActAssignmentCatalog, type ActAssignmentCatalog } from '@/lib/tutor/act-assignment-catalog';
import type { ActionResult } from '@/lib/types';

export async function loadActCatalog(): Promise<ActionResult<{ data: ActAssignmentCatalog }>> {
  try {
    const { supabase } = await requireRole(['teacher', 'manager', 'admin']);
    return actionOk(await loadActAssignmentCatalog(supabase));
  } catch (error) {
    if (error instanceof ApiError) return error.toActionResult();
    return actionFail('Could not load ACT options. Please try again.');
  }
}
