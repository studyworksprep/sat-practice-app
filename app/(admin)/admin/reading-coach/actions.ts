// Server Actions for the admin Reading Coach content surfaces (PR 1).
//
// Import re-parses and re-validates the pasted spec on the server —
// the client preview is convenience, never authority — then writes a
// draft through the caller's RLS-scoped client. Publish re-validates
// the *stored* content with the publish-only gates (nonpending
// rights) before stamping the immutable version.

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';
import {
  parseReadingCoachItemSpecText,
  validateReadingCoachItemSpec,
} from '@/lib/reading-coach/schema';
import {
  archiveReadingCoachItem,
  createReadingCoachDraft,
  publishReadingCoachVersion,
} from '@/lib/reading-coach/content';
import type { AuthContext } from '@/lib/api/auth';

async function requireAdmin(): Promise<AuthContext | ActionResult> {
  try {
    return await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
}

function isActionResult(v: AuthContext | ActionResult): v is ActionResult {
  return 'ok' in v;
}

export async function importReadingCoachSpec(
  _prev: unknown,
  formData: FormData,
) {
  const ctx = await requireAdmin();
  if (isActionResult(ctx)) return ctx;

  const rawText = formData.get('spec');
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return actionFail('Paste a ReadingCoachItemSpec JSON document.');
  }

  const parsed = parseReadingCoachItemSpecText(rawText);
  if ('error' in parsed) {
    return actionFail(`JSON parse error: ${parsed.error}`);
  }

  const validated = validateReadingCoachItemSpec(parsed.spec);
  if (!validated.ok) {
    return actionFail(
      `Validation failed: ${validated.errors
        .map((e) => `${e.path || '(root)'}: ${e.message}`)
        .join('; ')}`,
    );
  }

  let itemId: string;
  try {
    const result = await createReadingCoachDraft(
      ctx.supabase,
      validated.spec,
      ctx.user.id,
    );
    itemId = result.itemId;
  } catch (err) {
    return actionFail(err instanceof Error ? err.message : 'Import failed.');
  }

  revalidatePath('/admin/reading-coach');
  redirect(`/admin/reading-coach/${itemId}`);
}

export async function publishReadingCoachVersionAction(
  _prev: unknown,
  formData: FormData,
) {
  const ctx = await requireAdmin();
  if (isActionResult(ctx)) return ctx;

  const versionId = formData.get('version_id');
  if (typeof versionId !== 'string' || !versionId) {
    return actionFail('Missing version id.');
  }

  let itemId: string;
  try {
    const result = await publishReadingCoachVersion(ctx.supabase, versionId);
    itemId = result.itemId;
  } catch (err) {
    return actionFail(err instanceof Error ? err.message : 'Publish failed.');
  }

  revalidatePath('/admin/reading-coach');
  revalidatePath(`/admin/reading-coach/${itemId}`);
  redirect(`/admin/reading-coach/${itemId}`);
}

export async function archiveReadingCoachItemAction(
  _prev: unknown,
  formData: FormData,
) {
  const ctx = await requireAdmin();
  if (isActionResult(ctx)) return ctx;

  const itemId = formData.get('item_id');
  if (typeof itemId !== 'string' || !itemId) {
    return actionFail('Missing item id.');
  }

  try {
    await archiveReadingCoachItem(ctx.supabase, itemId);
  } catch (err) {
    return actionFail(err instanceof Error ? err.message : 'Archive failed.');
  }

  revalidatePath('/admin/reading-coach');
  revalidatePath(`/admin/reading-coach/${itemId}`);
  redirect(`/admin/reading-coach/${itemId}`);
}
