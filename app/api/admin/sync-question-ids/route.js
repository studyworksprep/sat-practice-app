import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../lib/supabase/server';

// POST /api/admin/sync-question-ids
// Accepts the Collegeboard metadata JSON array.
// For each entry, finds the matching question in the DB and ensures
// question_id has the correct Collegeboard questionId hex value.
// Also backfills source_external_id from ibn where present.
//
// Returns { matched, updated, skipped, not_found, errors }
export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let entries;
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });
    const text = await file.text();
    entries = JSON.parse(text);
  } else {
    const body = await request.json();
    entries = body.entries || body;
  }

  if (!Array.isArray(entries)) {
    return NextResponse.json({ error: 'Expected a JSON array of metadata entries' }, { status: 400 });
  }

  const admin = createServiceClient();

  // Pre-fetch all questions for efficient matching
  const { data: allQuestions, error: fetchErr } = await admin
    .from('questions')
    .select('id, question_id, source_external_id')
    .limit(50000);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  // Build lookup maps
  const byQuestionId = new Map(); // question_id text → row
  const byExternalId = new Map(); // source_external_id → row
  for (const q of allQuestions || []) {
    if (q.question_id) byQuestionId.set(q.question_id, q);
    if (q.source_external_id) byExternalId.set(q.source_external_id, q);
  }

  const results = {
    total: entries.length,
    already_correct: 0,
    updated_question_id: 0,
    updated_external_id: 0,
    not_found: 0,
    errors: [],
    details: [], // first 50 updates for preview
  };

  for (const entry of entries) {
    const { questionId, ibn } = entry;
    if (!questionId) { results.not_found++; continue; }

    const ibnClean = ibn && ibn.trim() ? ibn.trim() : null;

    // Strategy 1: question_id already matches questionId — check if we need to backfill ibn
    let dbRow = byQuestionId.get(questionId);
    if (dbRow) {
      // Already has the correct question_id
      const updates = {};
      if (ibnClean && !dbRow.source_external_id) {
        updates.source_external_id = ibnClean;
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await admin.from('questions').update(updates).eq('id', dbRow.id);
        if (error) {
          results.errors.push({ questionId, error: error.message });
        } else {
          results.updated_external_id++;
          if (results.details.length < 50) {
            results.details.push({ questionId, action: 'backfill_ibn', ibn: ibnClean });
          }
        }
      } else {
        results.already_correct++;
      }
      continue;
    }

    // Strategy 2: question_id matches ibn (wrong ID stored) — fix it
    if (ibnClean) {
      dbRow = byQuestionId.get(ibnClean);
      if (dbRow) {
        const updates = { question_id: questionId };
        if (!dbRow.source_external_id) updates.source_external_id = ibnClean;

        const { error } = await admin.from('questions').update(updates).eq('id', dbRow.id);
        if (error) {
          results.errors.push({ questionId, ibn: ibnClean, error: error.message });
        } else {
          results.updated_question_id++;
          if (results.details.length < 50) {
            results.details.push({ questionId, action: 'fix_question_id', old: ibnClean, new: questionId });
          }
          // Also update question_versions.question_id to keep them in sync
          await admin
            .from('question_versions')
            .update({ question_id: questionId })
            .eq('question_id', ibnClean);
          // And question_taxonomy
          await admin
            .from('question_taxonomy')
            .update({ question_id: questionId })
            .eq('question_id', ibnClean);
          // And question_status
          await admin
            .from('question_status')
            .update({ question_id: questionId })
            .eq('question_id', ibnClean);
        }
        continue;
      }

      // Strategy 3: source_external_id matches ibn — fix question_id
      dbRow = byExternalId.get(ibnClean);
      if (dbRow && dbRow.question_id !== questionId) {
        const oldQid = dbRow.question_id;
        const { error } = await admin.from('questions').update({ question_id: questionId }).eq('id', dbRow.id);
        if (error) {
          results.errors.push({ questionId, error: error.message });
        } else {
          results.updated_question_id++;
          if (results.details.length < 50) {
            results.details.push({ questionId, action: 'fix_via_external_id', old: oldQid, new: questionId });
          }
          // Update related tables
          await admin.from('question_versions').update({ question_id: questionId }).eq('question_id', oldQid);
          await admin.from('question_taxonomy').update({ question_id: questionId }).eq('question_id', oldQid);
          await admin.from('question_status').update({ question_id: questionId }).eq('question_id', oldQid);
        }
        continue;
      }
    }

    // No match found
    results.not_found++;
  }

  return NextResponse.json(results);
}
