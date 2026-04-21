'use server';

// Server Actions for the admin draft editor.
//
//   saveDraft   — update the four HTML fields + notes + status on
//                 a draft row. NULL (empty string) in a form field
//                 means "no change to that questions_v2 column";
//                 non-empty means "replace".
//   promoteDraft — copy the non-NULL fields onto questions_v2,
//                 clear the target's rendered columns + hash so
//                 the next render pass picks it up, and mark the
//                 draft row 'promoted'.
//   rejectDraft — flip status to 'rejected' (keeps the draft row
//                 for audit history but hides it from the default
//                 list).
//
// All three require admin role. RLS on question_content_drafts
// already enforces this at the DB layer; the explicit check lives
// here so the action returns a useful error instead of a silent
// zero-row update.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/api/auth';

function emptyToNull(v) {
  return v == null || v === '' ? null : v;
}

function parseOptionsOrThrow(raw) {
  if (raw == null || raw === '') return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`options is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('options must be a JSON array');
  }
  return parsed;
}

export async function saveDraft(draftId, formData) {
  const { user, profile, supabase } = await requireUser();
  if (profile.role !== 'admin') throw new Error('admin required');

  const stem_html      = emptyToNull(formData.get('stem_html'));
  const stimulus_html  = emptyToNull(formData.get('stimulus_html'));
  const rationale_html = emptyToNull(formData.get('rationale_html'));
  const options_raw    = emptyToNull(formData.get('options'));
  const notes          = emptyToNull(formData.get('notes'));
  const status         = emptyToNull(formData.get('status')) ?? 'pending';

  const options = parseOptionsOrThrow(options_raw);

  const { error } = await supabase
    .from('question_content_drafts')
    .update({
      stem_html,
      stimulus_html,
      rationale_html,
      options,
      notes,
      status,
      // created_by isn't updated on save — it's set at creation
      // time and stays with the original drafter.
    })
    .eq('id', draftId);

  if (error) throw new Error(`saveDraft: ${error.message}`);

  revalidatePath(`/admin/content/drafts/${draftId}`);
  revalidatePath('/admin/content/drafts');
}

export async function promoteDraft(draftId) {
  const { user, profile, supabase } = await requireUser();
  if (profile.role !== 'admin') throw new Error('admin required');

  // Load the draft to know the target question_id and which fields
  // are non-null (only those get copied).
  const { data: draft, error: loadErr } = await supabase
    .from('question_content_drafts')
    .select('id, question_id, status, stem_html, stimulus_html, rationale_html, options')
    .eq('id', draftId)
    .maybeSingle();

  if (loadErr || !draft) throw new Error('draft not found');
  if (draft.status === 'promoted') throw new Error('already promoted');

  const update = {};
  if (draft.stem_html      != null) update.stem_html      = draft.stem_html;
  if (draft.stimulus_html  != null) update.stimulus_html  = draft.stimulus_html;
  if (draft.rationale_html != null) update.rationale_html = draft.rationale_html;
  if (draft.options        != null) update.options        = draft.options;

  if (Object.keys(update).length === 0) {
    throw new Error('draft has no non-NULL fields to promote');
  }

  // Mark the rendered columns stale so the next render pass picks
  // up the row. Can't literally null rendered_source_hash because
  // a stale value also works — but nulling is explicit and avoids
  // hashing logic here. updated_at bumps too (the rendered-aware
  // trigger will detect the content change and fire now()).
  update.rendered_source_hash = null;
  update.rendered_at          = null;
  update.stem_rendered        = null;
  update.stimulus_rendered    = null;
  update.rationale_rendered   = null;
  update.options_rendered     = null;

  const { error: qErr } = await supabase
    .from('questions_v2')
    .update(update)
    .eq('id', draft.question_id);
  if (qErr) throw new Error(`promoteDraft: ${qErr.message}`);

  const { error: dErr } = await supabase
    .from('question_content_drafts')
    .update({
      status: 'promoted',
      promoted_at: new Date().toISOString(),
      promoted_by: user.id,
    })
    .eq('id', draftId);
  if (dErr) throw new Error(`promoteDraft (mark): ${dErr.message}`);

  revalidatePath(`/admin/content/drafts/${draftId}`);
  revalidatePath('/admin/content/drafts');
  redirect('/admin/content/drafts');
}

export async function rejectDraft(draftId) {
  const { user, profile, supabase } = await requireUser();
  if (profile.role !== 'admin') throw new Error('admin required');

  const { error } = await supabase
    .from('question_content_drafts')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', draftId);
  if (error) throw new Error(`rejectDraft: ${error.message}`);

  revalidatePath(`/admin/content/drafts/${draftId}`);
  revalidatePath('/admin/content/drafts');
  redirect('/admin/content/drafts');
}
