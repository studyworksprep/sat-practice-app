import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';
import { createServiceClient } from '../../../lib/supabase/server';

// GET /api/questions
// Params: difficulties=1,2,3 | score_bands=1,2 | domains=Algebra,... | topics=Linear+Functions,...
//         wrong_only | marked_only | hide_broken | q | limit | offset
export const GET = legacyApiRoute(async (request) => {
  const { searchParams } = new URL(request.url);

  // Multi-value difficulty (replaces single 'difficulty')
  const difficulties = (searchParams.get('difficulties') || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));

  const score_bands_raw = searchParams.get('score_bands');
  const score_bands = (score_bands_raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));

  // Multi-value domain / topic filters
  const domainList = (searchParams.get('domains') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const topicList = (searchParams.get('topics') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const wrong_only = searchParams.get('wrong_only') === 'true';
  const marked_only = searchParams.get('marked_only') === 'true';
  const hide_broken = searchParams.get('hide_broken') === 'true';
  const only_broken = searchParams.get('only_broken') === 'true';
  const undone_only = searchParams.get('undone_only') === 'true';
  const qText = (searchParams.get('q') || '').trim();

  // exclude_done_for: comma-separated student IDs — exclude questions done by ALL listed students
  const excludeDoneFor = (searchParams.get('exclude_done_for') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 5000);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);
  const balanced = searchParams.get('balanced') === 'true';

  const { user, supabase } = await requireUser();
  const userId = user.id;

  // Step 1: search + user-specific restriction queries in parallel
  const step1 = [];

  // Search queries (don't need userId)
  if (qText) {
    const safe = qText.replace(/[%_]/g, '\\$&');
    const pattern = `%${safe}%`;
    step1.push(
      supabase.from('questions').select('id, question_id').ilike('question_id', pattern).limit(2000),
      supabase.from('questions').select('id, question_id').ilike('source_external_id', pattern).limit(2000),
      supabase.from('question_versions').select('question_id, stem_html, stimulus_html')
        .eq('is_current', true).or(`stem_html.ilike.${pattern},stimulus_html.ilike.${pattern}`).limit(2000),
      // Answer-option text search. Uses PostgREST embedding to inner-join
      // question_versions → answer_options so we can apply the ilike at
      // the child level and filter is_current at the parent level in one
      // round trip. Returns one row per current-version question that has
      // at least one answer option whose content_html matches.
      supabase.from('question_versions')
        .select('question_id, answer_options!inner(id)')
        .eq('is_current', true)
        .ilike('answer_options.content_html', pattern)
        .limit(2000),
    );

    // Tag search: find questions tagged with a matching concept tag (teacher/manager/admin only via RLS)
    step1.push(
      supabase
        .from('concept_tags')
        .select('id, name, question_concept_tags(question_id)')
        .ilike('name', pattern)
        .limit(100)
    );
  }

  // NOTE: Domain/topic filtering is now handled directly in the main query's
  // question_taxonomy!inner join (see below), not as pre-restriction queries.
  // This avoids PostgREST's default row limit truncating results and
  // prevents large .in('id', ...) arrays from exceeding URL length limits.

  const step1Results = await Promise.all(step1);

  // Build restriction set from step 1 results
  let restrictIds = null;
  let s1idx = 0;

  // Search results
  if (qText) {
    const ids = new Set();
    // question_id matches
    const { data: qidRows, error: qidErr } = step1Results[s1idx++];
    if (qidErr) return NextResponse.json({ error: qidErr.message }, { status: 400 });
    (qidRows || []).forEach((r) => r?.id && ids.add(r.id));

    // source_external_id matches
    const { data: seidRows, error: seidErr } = step1Results[s1idx++];
    if (seidErr) return NextResponse.json({ error: seidErr.message }, { status: 400 });
    (seidRows || []).forEach((r) => r?.id && ids.add(r.id));

    // stem/stimulus matches
    const { data: vrows, error: vErr } = step1Results[s1idx++];
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 400 });
    (vrows || []).forEach((r) => r?.question_id && ids.add(r.question_id));

    // answer_options.content_html matches
    const { data: aoRows, error: aoErr } = step1Results[s1idx++];
    if (aoErr) return NextResponse.json({ error: aoErr.message }, { status: 400 });
    (aoRows || []).forEach((r) => r?.question_id && ids.add(r.question_id));

    // Tag search results (may be empty if user lacks RLS access)
    const { data: tagRows } = step1Results[s1idx++];
    for (const tag of tagRows || []) {
      const junctions = Array.isArray(tag.question_concept_tags) ? tag.question_concept_tags : [];
      for (const jct of junctions) {
        if (jct?.question_id) ids.add(jct.question_id);
      }
    }

    restrictIds = Array.from(ids);
    if (restrictIds.length === 0) return NextResponse.json({ items: [], totalCount: 0 });
  }

  // Step 2: User-specific restrictions in parallel (need userId)
  if ((marked_only || wrong_only) && !userId) {
    return NextResponse.json({ items: [], totalCount: 0 });
  }

  const step2 = [];
  if (marked_only && userId) {
    step2.push(
      supabase.from('question_status').select('question_id')
        .eq('user_id', userId).eq('marked_for_review', true).limit(10000)
    );
  }
  if (wrong_only && userId) {
    step2.push(
      supabase.from('question_status').select('question_id')
        .eq('user_id', userId).eq('is_done', true).eq('last_is_correct', false).limit(10000)
    );
  }

  if (step2.length > 0) {
    const step2Results = await Promise.all(step2);
    for (let i = 0; i < step2Results.length; i++) {
      const { data: rows, error: err } = step2Results[i];
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
      const ids = (rows || []).map((r) => r.question_id).filter(Boolean);
      restrictIds = intersect(restrictIds, ids);
      if (!restrictIds || restrictIds.length === 0) return NextResponse.json({ items: [], totalCount: 0 });
    }
  }

  // exclude_done_for — exclude questions already done by ALL listed students
  let excludeDoneIds = null;
  if (excludeDoneFor.length > 0 && userId) {
    const svc = createServiceClient();
    const { data: callerProfile } = await svc
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (callerProfile?.role === 'teacher' || callerProfile?.role === 'manager' || callerProfile?.role === 'admin') {
      const { data: doneRows } = await svc
        .from('question_status')
        .select('question_id, user_id')
        .in('user_id', excludeDoneFor)
        .eq('is_done', true)
        .limit(50000);
      if (doneRows && doneRows.length > 0) {
        const doneByStudent = {};
        for (const r of doneRows) {
          if (!doneByStudent[r.question_id]) doneByStudent[r.question_id] = new Set();
          doneByStudent[r.question_id].add(r.user_id);
        }
        const toExclude = [];
        for (const [qid, doneStudents] of Object.entries(doneByStudent)) {
          if (excludeDoneFor.every(sid => doneStudents.has(sid))) {
            toExclude.push(qid);
          }
        }
        if (toExclude.length > 0) {
          if (restrictIds) {
            const excludeSet = new Set(toExclude);
            restrictIds = restrictIds.filter(id => !excludeSet.has(id));
            if (restrictIds.length === 0) return NextResponse.json({ items: [], totalCount: 0 });
          } else {
            excludeDoneIds = toExclude;
          }
        }
      }
    }
  }

  // undone_only — exclude questions the current user has already completed
  if (undone_only && userId) {
    const svc = createServiceClient();
    const { data: doneRows } = await svc
      .from('question_status')
      .select('question_id')
      .eq('user_id', userId)
      .eq('is_done', true)
      .limit(50000);
    if (doneRows && doneRows.length > 0) {
      const toExclude = doneRows.map(r => r.question_id);
      if (restrictIds) {
        const excludeSet = new Set(toExclude);
        restrictIds = restrictIds.filter(id => !excludeSet.has(id));
        if (restrictIds.length === 0) return NextResponse.json({ items: [], totalCount: 0 });
      } else {
        excludeDoneIds = excludeDoneIds
          ? [...new Set([...excludeDoneIds, ...toExclude])]
          : toExclude;
      }
    }
  }

  // hide_broken — handled in the main query via .eq('is_broken', false)

  // Main query
  let q = supabase
    .from('questions')
    .select(
      `
      id,
      question_id,
      is_broken,
      question_taxonomy!inner (
        question_id,
        domain_code,
        domain_name,
        skill_code,
        skill_name,
        difficulty,
        score_band
      ),
     question_status!left (
        user_id,
        question_id,
        is_done,
        marked_for_review,
        attempts_count,
        correct_attempts_count,
        last_is_correct
      )
    `,
      { count: 'exact' }
    )
    .order('id', { ascending: true });

  if (restrictIds) q = q.in('id', restrictIds);
  if (excludeDoneIds && excludeDoneIds.length > 0) {
    // Supabase doesn't have a direct "not in" for the main table ID,
    // so we use .not('id', 'in', `(${ids})`) syntax
    q = q.not('id', 'in', `(${excludeDoneIds.join(',')})`);
  }

  if (difficulties.length > 0) q = q.in('question_taxonomy.difficulty', difficulties);
  if (score_bands.length > 0) q = q.in('question_taxonomy.score_band', score_bands);
  if (only_broken) q = q.eq('is_broken', true);
  else if (hide_broken) q = q.eq('is_broken', false);

  // Domain/topic filtering via the question_taxonomy join.
  // When both are present, use OR: match any selected domain OR any selected topic.
  if (domainList.length > 0 && topicList.length > 0) {
    const domainCsv = domainList.map((d) => `"${d}"`).join(',');
    const topicCsv  = topicList.map((t) => `"${t}"`).join(',');
    q = q.or(
      `domain_name.in.(${domainCsv}),skill_code.in.(${topicCsv})`,
      { foreignTable: 'question_taxonomy' }
    );
  } else if (domainList.length > 0) {
    q = q.in('question_taxonomy.domain_name', domainList);
  } else if (topicList.length > 0) {
    q = q.in('question_taxonomy.skill_code', topicList);
  }

  // When balanced mode is on, fetch a larger pool so we can distribute across topics
  const fetchLimit = balanced ? Math.min(limit * 5, 5000) : limit;
  q = q.range(offset, offset + fetchLimit - 1);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const allItems = (data || [])
    .map((row) => {
      const tax = row.question_taxonomy?.[0] ?? row.question_taxonomy ?? null;

      const stArr = Array.isArray(row.question_status)
        ? row.question_status
        : row.question_status
        ? [row.question_status]
        : [];

      const st = userId ? stArr.find((s) => s?.user_id === userId) : stArr[0];

      if (!tax) return null;

      return {
        question_id: row.id,
        question_key: row.question_id || null,

        domain_code: tax.domain_code,
        domain_name: tax.domain_name,
        skill_code: tax.skill_code,
        skill_name: tax.skill_name,
        difficulty: tax.difficulty,
        score_band: tax.score_band,

        is_done: st?.is_done ?? false,
        marked_for_review: st?.marked_for_review ?? false,
        is_broken: row.is_broken ?? false,
        attempts_count: st?.attempts_count ?? 0,
        correct_attempts_count: st?.correct_attempts_count ?? 0,
        last_is_correct: st?.last_is_correct ?? null,
      };
    })
    .filter(Boolean);

  // Balanced mode: randomly pick from topic buckets so each is represented evenly
  let items;
  if (balanced && allItems.length > limit) {
    const buckets = {};
    for (const item of allItems) {
      const key = item.skill_code || item.skill_name || item.domain_name || '_';
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(item);
    }
    const bucketKeys = Object.keys(buckets);
    // Shuffle within each bucket for variety
    for (const key of bucketKeys) {
      const arr = buckets[key];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }
    // Randomly pick a non-exhausted bucket for each slot
    const picked = [];
    const pointers = {};
    for (const key of bucketKeys) pointers[key] = 0;
    while (picked.length < limit) {
      const available = bucketKeys.filter(k => pointers[k] < buckets[k].length);
      if (available.length === 0) break;
      const chosen = available[Math.floor(Math.random() * available.length)];
      picked.push(buckets[chosen][pointers[chosen]++]);
    }
    items = picked;
  } else {
    items = allItems.slice(0, limit);
  }

  const totalCount = typeof count === 'number' ? count : 0;

  return NextResponse.json({ items, totalCount });
});

// Intersect an existing restriction set with a new list.
// If existing is null (no restriction yet), the new list becomes the restriction.
function intersect(existing, incoming) {
  if (existing === null) return incoming;
  const set = new Set(existing);
  return incoming.filter((id) => set.has(id));
}
