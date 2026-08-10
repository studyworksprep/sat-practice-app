// Reading Coach content data access (admin surfaces, PR 1).
//
// Every function takes the caller's RLS-scoped client from
// requireRole()/requireUser() — Reading Coach never uses the service
// role (plan "Authorization and RLS"). Writes therefore succeed only
// for admins, enforced by the table policies, with the app-layer
// requireRole(['admin']) gate in front of them.
//
// Immutability contract: a published version row is never updated
// (except stamping published_at once). Re-importing an existing slug
// creates the next version_number as a draft; publishing that draft
// re-points items.current_version_id and syncs the item's identity
// fields from the version's stored itemMeta snapshot.
//
// Failures throw plain Errors with admin-readable messages; the
// Server Actions catch and convert to actionFail().

import type { TypedSupabaseClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/types/database';
import { validateReadingCoachItemSpec } from './schema.ts';
import {
  READING_COACH_CHOICE_LABELS,
  type ReadingCoachChoiceRow,
  type ReadingCoachItemRow,
  type ReadingCoachItemSpec,
  type ReadingCoachItemVersionRow,
  type StoredVersionRubric,
} from './types.ts';

export interface ReadingCoachItemListEntry {
  item: ReadingCoachItemRow;
  versionCount: number;
  latestVersionNumber: number | null;
  publishedVersionNumber: number | null;
}

export async function listReadingCoachItems(
  supabase: TypedSupabaseClient,
): Promise<ReadingCoachItemListEntry[]> {
  const { data, error } = await supabase
    .from('reading_coach_items')
    .select(
      '*, reading_coach_item_versions!item_id (id, version_number, published_at)',
    )
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Failed to list items: ${error.message}`);

  return (data ?? []).map((row) => {
    const { reading_coach_item_versions: versions, ...item } = row;
    const published = item.current_version_id
      ? versions.find((v) => v.id === item.current_version_id)
      : undefined;
    return {
      item,
      versionCount: versions.length,
      latestVersionNumber:
        versions.length > 0
          ? Math.max(...versions.map((v) => v.version_number))
          : null,
      publishedVersionNumber: published?.version_number ?? null,
    };
  });
}

export interface ReadingCoachItemDetail {
  item: ReadingCoachItemRow;
  versions: ReadingCoachItemVersionRow[];
}

export async function getReadingCoachItem(
  supabase: TypedSupabaseClient,
  itemId: string,
): Promise<ReadingCoachItemDetail | null> {
  const { data: item, error } = await supabase
    .from('reading_coach_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load item: ${error.message}`);
  if (!item) return null;

  const { data: versions, error: vErr } = await supabase
    .from('reading_coach_item_versions')
    .select('*')
    .eq('item_id', itemId)
    .order('version_number', { ascending: false });
  if (vErr) throw new Error(`Failed to load versions: ${vErr.message}`);

  return { item, versions: versions ?? [] };
}

export async function getReadingCoachVersionChoices(
  supabase: TypedSupabaseClient,
  versionId: string,
): Promise<ReadingCoachChoiceRow[]> {
  const { data, error } = await supabase
    .from('reading_coach_choices')
    .select('*')
    .eq('item_version_id', versionId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`Failed to load choices: ${error.message}`);
  return data ?? [];
}

function storedRubricFromSpec(spec: ReadingCoachItemSpec): StoredVersionRubric {
  return {
    itemMeta: {
      title: spec.title,
      genre: spec.genre,
      difficulty: spec.difficulty,
      source: spec.source,
    },
    taskRubric: spec.taskRubric,
    processingUnits: spec.processingUnits,
    passageRubric: spec.passageRubric,
    preanswerRubric: spec.preanswerRubric,
  };
}

export interface CreateDraftResult {
  itemId: string;
  versionId: string;
  versionNumber: number;
  isNewItem: boolean;
}

/** Import a validated spec as a draft. New slug → new item + version 1.
 *  Existing slug → next version_number on that item, leaving every
 *  existing version (and the live item fields) untouched. */
export async function createReadingCoachDraft(
  supabase: TypedSupabaseClient,
  spec: ReadingCoachItemSpec,
  userId: string,
): Promise<CreateDraftResult> {
  const { data: existing, error: findErr } = await supabase
    .from('reading_coach_items')
    .select('id')
    .eq('slug', spec.slug)
    .maybeSingle();
  if (findErr) throw new Error(`Slug lookup failed: ${findErr.message}`);

  let itemId: string;
  let versionNumber: number;
  const isNewItem = !existing;

  if (existing) {
    itemId = existing.id;
    const { data: latest, error: latestErr } = await supabase
      .from('reading_coach_item_versions')
      .select('version_number')
      .eq('item_id', itemId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) throw new Error(`Version lookup failed: ${latestErr.message}`);
    versionNumber = (latest?.version_number ?? 0) + 1;
  } else {
    const { data: item, error: itemErr } = await supabase
      .from('reading_coach_items')
      .insert({
        slug: spec.slug,
        title: spec.title,
        genre: spec.genre,
        difficulty: spec.difficulty,
        source_metadata: spec.source as unknown as Json,
        created_by: userId,
      })
      .select('id')
      .single();
    if (itemErr) throw new Error(`Item insert failed: ${itemErr.message}`);
    itemId = item.id;
    versionNumber = 1;
  }

  const { data: version, error: verErr } = await supabase
    .from('reading_coach_item_versions')
    .insert({
      item_id: itemId,
      version_number: versionNumber,
      question_stem_html: spec.questionStemHtml,
      passage_html: spec.passageHtml,
      task_type: spec.taskType,
      processing_mode: spec.processingMode,
      rubric: storedRubricFromSpec(spec) as unknown as Json,
      created_by: userId,
    })
    .select('id')
    .single();
  // No cleanup deletes on partial failure: the schema grants no
  // DELETE (content archives, never deletes). A stranded item or
  // choiceless version cannot publish (validation fails) and is
  // superseded by simply re-importing the same slug.
  if (verErr) {
    throw new Error(`Version insert failed: ${verErr.message}`);
  }

  const { error: choicesErr } = await supabase
    .from('reading_coach_choices')
    .insert(
      spec.choices.map((c) => ({
        item_version_id: version.id,
        label: c.label,
        sort_order: READING_COACH_CHOICE_LABELS.indexOf(c.label) + 1,
        choice_html: c.html,
        is_correct: c.correct,
        rationale_html: c.rationaleHtml,
        error_code: c.errorCode ?? null,
      })),
    );
  if (choicesErr) {
    throw new Error(`Choices insert failed: ${choicesErr.message}`);
  }

  if (!isNewItem) {
    await supabase
      .from('reading_coach_items')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', itemId);
  }

  return { itemId, versionId: version.id, versionNumber, isNewItem };
}

/** Rebuild the spec shape from a stored version + its choices, so the
 *  publish gate re-validates exactly what will go live. */
export function specFromStoredVersion(
  item: ReadingCoachItemRow,
  version: ReadingCoachItemVersionRow,
  choices: ReadingCoachChoiceRow[],
): unknown {
  const rubric = version.rubric as unknown as StoredVersionRubric;
  const meta = rubric?.itemMeta;
  return {
    slug: item.slug,
    title: meta?.title,
    genre: meta?.genre,
    difficulty: meta?.difficulty,
    taskType: version.task_type,
    source: meta?.source,
    questionStemHtml: version.question_stem_html,
    passageHtml: version.passage_html,
    processingMode: version.processing_mode,
    taskRubric: rubric?.taskRubric,
    processingUnits: rubric?.processingUnits,
    passageRubric: rubric?.passageRubric,
    preanswerRubric: rubric?.preanswerRubric,
    choices: choices.map((c) => ({
      label: c.label,
      html: c.choice_html,
      correct: c.is_correct,
      rationaleHtml: c.rationale_html,
      ...(c.error_code ? { errorCode: c.error_code } : {}),
    })),
  };
}

/** Publish a draft version: re-validate the stored content with the
 *  publish gates, stamp published_at, and sync the item row (status,
 *  pointer, identity fields from the version's itemMeta). */
export async function publishReadingCoachVersion(
  supabase: TypedSupabaseClient,
  versionId: string,
): Promise<{ itemId: string; versionNumber: number }> {
  const { data: version, error: vErr } = await supabase
    .from('reading_coach_item_versions')
    .select('*')
    .eq('id', versionId)
    .maybeSingle();
  if (vErr) throw new Error(`Failed to load version: ${vErr.message}`);
  if (!version) throw new Error('Version not found.');
  if (version.published_at) throw new Error('Version is already published.');

  const { data: item, error: iErr } = await supabase
    .from('reading_coach_items')
    .select('*')
    .eq('id', version.item_id)
    .single();
  if (iErr) throw new Error(`Failed to load item: ${iErr.message}`);

  const choices = await getReadingCoachVersionChoices(supabase, versionId);
  const candidate = specFromStoredVersion(item, version, choices);
  const validated = validateReadingCoachItemSpec(candidate, { forPublish: true });
  if (!validated.ok) {
    const summary = validated.errors
      .map((e) => `${e.path || '(root)'}: ${e.message}`)
      .join('; ');
    throw new Error(`Stored content fails publish validation — ${summary}`);
  }

  const { error: pubErr } = await supabase
    .from('reading_coach_item_versions')
    .update({ published_at: new Date().toISOString() })
    .eq('id', versionId)
    .is('published_at', null);
  if (pubErr) throw new Error(`Failed to publish version: ${pubErr.message}`);

  const meta = validated.spec;
  const { error: itemErr } = await supabase
    .from('reading_coach_items')
    .update({
      status: 'published',
      current_version_id: versionId,
      title: meta.title,
      genre: meta.genre,
      difficulty: meta.difficulty,
      source_metadata: meta.source as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', version.item_id);
  if (itemErr) throw new Error(`Version published but item sync failed: ${itemErr.message}`);

  return { itemId: version.item_id, versionNumber: version.version_number };
}

export async function archiveReadingCoachItem(
  supabase: TypedSupabaseClient,
  itemId: string,
): Promise<void> {
  const { error } = await supabase
    .from('reading_coach_items')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) throw new Error(`Failed to archive item: ${error.message}`);
}
