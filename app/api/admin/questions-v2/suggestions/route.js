import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../../lib/supabase/server';

// ============================================================
// /api/admin/questions-v2/suggestions
// ============================================================
// Backing store for the Bulk Review panel on the admin dashboard.
// Reads from / writes to the questions_v2_fix_suggestions staging
// table populated by the batch scripts under /scripts.
//
//   GET    ?status=collected&classification=trivial&limit=25&offset=0
//          → list suggestions with their source + suggested fields
//
//   POST   { action: 'apply', ids: [uuid, uuid, ...] }
//          → for each suggestion: copy suggested_* onto questions_v2
//            and mark the suggestion as 'applied'
//
//   POST   { action: 'reject', ids: [uuid, uuid, ...] }
//          → mark the suggestions as 'rejected' without touching
//            questions_v2

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin only' }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'collected';
  const classification = searchParams.get('classification'); // optional
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 25));
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);

  const admin = createServiceClient();

  let query = admin
    .from('questions_v2_fix_suggestions')
    .select(
      'id, question_id, batch_id, status, model, diff_classification, error_message, submitted_at, collected_at, reviewed_at, source_stimulus_html, source_stem_html, source_options, suggested_stimulus_html, suggested_stem_html, suggested_options',
      { count: 'exact' }
    )
    .eq('status', status)
    .order('collected_at', { ascending: false, nullsFirst: false })
    .order('submitted_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (classification) query = query.eq('diff_classification', classification);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate counts per classification for the filter UI.
  const { data: counts, error: countsErr } = await admin
    .from('questions_v2_fix_suggestions')
    .select('status, diff_classification')
    .eq('status', 'collected');

  const byClassification = { trivial: 0, non_trivial: 0, identical: 0, error: 0 };
  if (!countsErr && Array.isArray(counts)) {
    for (const row of counts) {
      const k = row.diff_classification || 'error';
      if (k in byClassification) byClassification[k]++;
    }
  }

  return NextResponse.json({
    suggestions: data || [],
    total: count || 0,
    counts: byClassification,
  });
}

export async function POST(request) {
  const { user, error: authError } = await requireAdmin();
  if (authError) return authError;

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { action, ids, classification } = body || {};
  if (!action) {
    return NextResponse.json({ error: 'action required' }, { status: 400 });
  }

  const admin = createServiceClient();

  // Bulk reject every collected suggestion matching a classification
  // filter. Used for "the prompt was buggy, nuke the N bad rows so I
  // can re-submit" workflows. Does NOT require an ids array — the
  // filter is the target.
  if (action === 'reject_by_filter') {
    if (!classification) {
      return NextResponse.json(
        { error: 'classification required for reject_by_filter' },
        { status: 400 }
      );
    }
    const nowIso = new Date().toISOString();
    const { error, count } = await admin
      .from('questions_v2_fix_suggestions')
      .update(
        {
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: nowIso,
        },
        { count: 'exact' }
      )
      .eq('status', 'collected')
      .eq('diff_classification', classification);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rejected: count || 0, classification });
  }

  // All remaining actions require an ids array.
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: 'ids (non-empty array) required for this action' },
      { status: 400 }
    );
  }

  if (action === 'reject') {
    const { error } = await admin
      .from('questions_v2_fix_suggestions')
      .update({
        status: 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .in('id', ids)
      .eq('status', 'collected'); // only reject ones still pending review
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rejected: ids.length });
  }

  if (action === 'apply') {
    // Load the suggestions so we can copy their suggested_* fields
    // onto the questions_v2 rows. Only process suggestions that are
    // still 'collected' — a second apply call for already-applied
    // rows is a no-op.
    const { data: rows, error: loadErr } = await admin
      .from('questions_v2_fix_suggestions')
      .select('id, question_id, suggested_stimulus_html, suggested_stem_html, suggested_options')
      .in('id', ids)
      .eq('status', 'collected');
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });

    const nowIso = new Date().toISOString();
    let applied = 0;
    const errors = [];

    for (const row of rows || []) {
      // Load the existing questions_v2 row so we can merge options by
      // label (preserving ordinal). Mirrors the PUT handler in
      // /api/admin/questions-v2/fix/route.js.
      const { data: existing } = await admin
        .from('questions_v2')
        .select('id, options')
        .eq('id', row.question_id)
        .maybeSingle();
      if (!existing) {
        errors.push({ id: row.id, error: 'question_v2 row not found' });
        continue;
      }

      const update = {
        stimulus_html: row.suggested_stimulus_html,
        stem_html: row.suggested_stem_html,
        last_fixed_at: nowIso,
        last_fixed_by: user.id,
      };

      if (Array.isArray(row.suggested_options) && row.suggested_options.length > 0) {
        const existingOpts = Array.isArray(existing.options) ? existing.options : [];
        const byLabel = new Map(existingOpts.map((o) => [String(o.label), o]));
        update.options = row.suggested_options
          .map((o, i) => {
            const prior = byLabel.get(String(o.label)) || {};
            return {
              label: o.label ?? prior.label ?? String.fromCharCode(65 + i),
              ordinal: prior.ordinal ?? i,
              content_html: o.content_html ?? '',
            };
          })
          .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
      }

      const { error: updErr } = await admin
        .from('questions_v2')
        .update(update)
        .eq('id', row.question_id);
      if (updErr) {
        errors.push({ id: row.id, error: updErr.message });
        continue;
      }

      const { error: stErr } = await admin
        .from('questions_v2_fix_suggestions')
        .update({
          status: 'applied',
          reviewed_by: user.id,
          reviewed_at: nowIso,
        })
        .eq('id', row.id);
      if (stErr) {
        errors.push({ id: row.id, error: stErr.message });
        continue;
      }

      applied++;
    }

    return NextResponse.json({
      ok: true,
      applied,
      errors: errors.length > 0 ? errors : undefined,
    });
  }

  return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
}
