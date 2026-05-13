// GET /api/public/students/search?q=<name>
//
// Service-to-service search for an existing Studyworks student
// account. Designed for the LessonWorks "Link to Studyworks" flow:
// before firing the provision endpoint and risking a duplicate
// account, LessonWorks calls this with the student's name (and
// optionally email) to surface any pre-existing Studyworks-native
// profile that should be claimed instead. The LessonWorks-side
// admin then either picks a candidate (and POSTs to /provision
// with `claim_existing_studyworks_id=<uuid>` — see provision/route
// .js) or confirms "none of these" and lets provision create a
// fresh one.
//
// Auth. Single shared `EXTERNAL_API_KEY`, same secret the existing
// public endpoints use. Not multi-tenant.
//
// Match logic. Case-insensitive substring on first_name + last_name
// concatenated, plus an exact email match if `email` is provided.
// Returns at most 25 candidates. Each row includes attempts_count
// so the caller can prefer profiles that already carry practice
// history.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateExternalApiKey } from '@/lib/externalAuth';

export const dynamic = 'force-dynamic';

const MAX_RESULTS = 25;

export async function GET(request) {
  if (!validateExternalApiKey(request)) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') ?? '').trim();
  const email = String(url.searchParams.get('email') ?? '').trim();
  if (!q && !email) {
    return NextResponse.json(
      { error: 'At least one of q or email is required' },
      { status: 400 },
    );
  }

  const svc = createServiceClient();

  // Build the name-or-email filter. ilike escapes any '%' / '_' the
  // caller might pass so a stray wildcard in a real name doesn't
  // explode the search space.
  let query = svc
    .from('profiles')
    .select('id, first_name, last_name, email, role, is_active, created_at, lessonworks_student_id')
    .eq('role', 'student')
    .limit(MAX_RESULTS);

  const conditions = [];
  if (q) {
    // Substring match on first_name and last_name independently.
    // Whitespace-strip the query first so "La Rocca" finds a stored
    // "LaRocca" and vice-versa — common collation difference between
    // self-typed and admin-typed last names. Doesn't fix every shape
    // (apostrophes, hyphens) but kills the most frequent miss.
    const safe = q.replace(/[%_\\]/g, '\\$&').replace(/,/g, '');
    const pattern = `%${safe}%`;
    const compact = safe.replace(/\s+/g, '');
    const compactPattern = `%${compact}%`;
    conditions.push(`first_name.ilike.${pattern}`);
    conditions.push(`last_name.ilike.${pattern}`);
    if (compact !== safe) {
      conditions.push(`first_name.ilike.${compactPattern}`);
      conditions.push(`last_name.ilike.${compactPattern}`);
    }
  }
  if (email) {
    // Exact email match against profile.email — the student-identity
    // address. Per the PR #46 (LW) + parent_email revert (SW) design,
    // LessonWorks's `email` query param is the student's email, not
    // the parent billing address, so a direct equality on
    // profile.email is what we want. Case-insensitive via ilike.
    const safe = email.replace(/[%_\\]/g, '\\$&').replace(/,/g, '');
    conditions.push(`email.ilike.${safe}`);
  }
  query = query.or(conditions.join(','));

  const { data: profiles, error: profErr } = await query;
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  const profileIds = (profiles ?? []).map((p) => p.id);
  // Per-profile attempt counts so the caller can rank by "this one
  // already has practice history." Done as one round-trip with an
  // .in() filter rather than N count(*) queries.
  const attemptsByProfile = new Map();
  if (profileIds.length > 0) {
    const { data: rows } = await svc
      .from('attempts')
      .select('user_id')
      .in('user_id', profileIds);
    for (const r of rows ?? []) {
      attemptsByProfile.set(r.user_id, (attemptsByProfile.get(r.user_id) ?? 0) + 1);
    }
  }

  const results = (profiles ?? [])
    .map((p) => ({
      student_id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      is_active: p.is_active,
      created_at: p.created_at,
      attempts_count: attemptsByProfile.get(p.id) ?? 0,
      lessonworks_student_id: p.lessonworks_student_id,
      already_linked: p.lessonworks_student_id != null,
    }))
    // Newest first as a stable default; the caller will likely
    // re-sort by attempts_count desc to surface rich accounts.
    .sort((a, b) => {
      const ac = a.attempts_count;
      const bc = b.attempts_count;
      if (ac !== bc) return bc - ac;
      return Date.parse(b.created_at ?? 0) - Date.parse(a.created_at ?? 0);
    });

  return NextResponse.json({ results });
}
