// GET /api/public/students/search?q=<name>&email=<addr>
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
// Match logic.
//
//   - q is tokenized on whitespace. Each token must appear
//     somewhere in (first_name OR last_name) in the resulting row,
//     case-insensitively, with whitespace normalized away. This is
//     the change that fixes "Thomas Kellogg" / "Thalia Escobar
//     Topes" style searches — the prior implementation treated the
//     entire q as a substring of either first_name or last_name,
//     which never hits when the search string spans both columns.
//
//   - email, if provided, is matched case-insensitively against
//     profile.email (whitespace stripped on both sides). This is
//     an OR with the name path — a row that matches by name OR by
//     email is returned.
//
//   - The SQL prefilter is a broad OR across every (token × column)
//     pair plus the email; the JS narrow then enforces "all tokens
//     must match" using a single normalized concatenation of
//     first_name + ' ' + last_name. Doing the AND-of-tokens in JS
//     rather than SQL lets us cover the multi-word-last-name
//     ("La Rocca" stored, "LaRocca" searched, or vice versa)
//     normalization in one place without bending PostgREST into
//     supporting regexp_replace ilike comparisons.
//
// Returns at most 25 candidates, ranked by attempts_count desc
// (then created_at desc) so the caller can lean on the top result
// when its auto-claim heuristic is confident.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateExternalApiKey } from '@/lib/externalAuth';

export const dynamic = 'force-dynamic';

const MAX_RESULTS = 25;
// Generous prefetch cap. The broad SQL OR can return more rows than
// we'll ultimately surface (e.g. every "Thomas" in the roster on a
// single-token "Thomas" search) and the JS-side narrow trims to the
// real matches. 200 covers the cohort we have today comfortably and
// leaves headroom; bump if a name search starts truncating.
const SQL_PREFETCH_CAP = 200;

function normalize(s) {
  return (s ?? '').toString().toLowerCase().replace(/\s+/g, '');
}

// Escape characters that have meaning in PostgREST's ilike filter
// expressions so a stray '%' / '_' / '\' / ',' in user input doesn't
// silently turn the lookup into match-anything or break the
// comma-separated .or() syntax.
function escapeIlike(s) {
  return s.replace(/[%_\\]/g, '\\$&').replace(/,/g, '');
}

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

  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

  // Broad SQL prefilter. Per-token OR across first/last (so the
  // query returns any row containing any one token); email OR'd in
  // at the top level so an email-only match still surfaces even
  // when no name token hits.
  const broadConds = [];
  for (const t of tokens) {
    const safe = escapeIlike(t);
    broadConds.push(`first_name.ilike.%${safe}%`);
    broadConds.push(`last_name.ilike.%${safe}%`);
  }
  if (email) {
    broadConds.push(`email.ilike.${escapeIlike(email)}`);
  }
  // Defensive — should be unreachable given the q/email gate above,
  // but safer than asking PostgREST to handle an empty .or().
  if (broadConds.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const svc = createServiceClient();

  const { data: candidates, error: profErr } = await svc
    .from('profiles')
    .select('id, first_name, last_name, email, role, is_active, created_at, lessonworks_student_id')
    .eq('role', 'student')
    .or(broadConds.join(','))
    .limit(SQL_PREFETCH_CAP);
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  // JS narrow: ALL name tokens must appear in the combined
  // first+last (whitespace-normalized, case-insensitive). Email
  // match is independent — a hit on email alone is sufficient.
  const normTokens = tokens.map(normalize).filter(Boolean);
  const normEmail = email ? normalize(email) : null;
  const filtered = (candidates ?? []).filter((p) => {
    if (normTokens.length > 0) {
      const combined = normalize(`${p.first_name ?? ''} ${p.last_name ?? ''}`);
      if (normTokens.every((t) => combined.includes(t))) return true;
    }
    if (normEmail && normalize(p.email) === normEmail) return true;
    return false;
  });

  // Per-profile attempt counts so the caller can rank by "this one
  // already has practice history." Done as one round-trip with an
  // .in() filter rather than N count(*) queries.
  const profileIds = filtered.map((p) => p.id);
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

  const results = filtered
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
    .sort((a, b) => {
      if (a.attempts_count !== b.attempts_count) return b.attempts_count - a.attempts_count;
      return Date.parse(b.created_at ?? 0) - Date.parse(a.created_at ?? 0);
    })
    .slice(0, MAX_RESULTS);

  return NextResponse.json({ results });
}
