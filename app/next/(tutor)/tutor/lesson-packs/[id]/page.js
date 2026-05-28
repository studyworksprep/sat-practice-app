// Tutor → lesson-pack builder. Server Component that loads:
//
//   1. The pack metadata (owned-only via RLS — a 404 here is the
//      caller hitting another tutor's id, the bouncer is correct).
//
//   2. The pack's current question list, joined to questions_v2 so
//      the right pane renders display_code, taxonomy, snippet, etc.
//      without a second waterfall.
//
//   3. The first page of unfiltered library results (initial state
//      of the left pane), with questions already in the pack
//      excluded so the tutor doesn't see duplicates on first load.
//
//   4. Distinct domains + skills for the dropdowns.
//
// Everything interactive (search, add, remove, reorder, rename)
// lives in <LessonPackBuilder>. The server payload is the seed
// state; subsequent searches go through the searchQuestions server
// action.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { LessonPackBuilder } from './LessonPackBuilder';
import s from './LessonPackBuilder.module.css';

export const dynamic = 'force-dynamic';

const INITIAL_LIBRARY_PAGE_SIZE = 25;

export default async function LessonPackBuilderPage({ params }) {
  const { id } = await params;
  const { user, profile, supabase } = await requireUser();
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  const { data: pack, error: packErr } = await supabase
    .from('lesson_packs')
    .select('id, name, description, created_at, updated_at, teacher_id')
    .eq('id', id)
    .maybeSingle();

  if (packErr || !pack) notFound();
  // Defense in depth — RLS already enforces this, but the role gate
  // above can include managers/admins, and we only want the owner
  // editing here (admins should drop down into the DB if they need
  // to fix one).
  if (pack.teacher_id !== user.id && profile.role !== 'admin') {
    notFound();
  }

  // Current pack contents, sorted by position. The join pulls only
  // the columns the right pane renders — full HTML / options stay
  // out of this hot path, students hit them via the question detail
  // route if/when packs feed into assignments later.
  const { data: junctionRows } = await supabase
    .from('lesson_pack_questions')
    .select(
      `
      question_id, position,
      question:questions_v2 (
        id, display_code, question_type, domain_name, skill_name,
        difficulty, score_band, stem_html
      )
    `,
    )
    .eq('pack_id', id)
    .order('position', { ascending: true });

  const packQuestions = (junctionRows ?? [])
    .filter((r) => r.question)
    .map((r) => ({
      id: r.question.id,
      display_code: r.question.display_code,
      question_type: r.question.question_type,
      domain_name: r.question.domain_name,
      skill_name: r.question.skill_name,
      difficulty: r.question.difficulty,
      score_band: r.question.score_band,
      stem_html: r.question.stem_html,
      position: r.position,
    }));

  const excludeIds = packQuestions.map((q) => q.id);

  // First page of the library. Exclude what's already in the pack
  // so the left pane starts in the "more to add" state.
  let libraryQuery = supabase
    .from('questions_v2')
    .select(
      'id, display_code, question_type, domain_name, skill_name, difficulty, score_band, stem_html',
      { count: 'exact' },
    )
    .eq('is_published', true)
    .eq('is_broken', false)
    .order('display_code', { ascending: true, nullsFirst: false })
    .range(0, INITIAL_LIBRARY_PAGE_SIZE - 1);

  if (excludeIds.length > 0) {
    libraryQuery = libraryQuery.not('id', 'in', `(${excludeIds.join(',')})`);
  }

  const { data: libraryRows, count: libraryTotal } = await libraryQuery;

  // Distinct (domain, skill) for the filter dropdowns. Caps at 10k
  // rows — the taxonomy is < 50 distinct combinations in practice.
  const { data: taxRows } = await supabase
    .from('questions_v2')
    .select('domain_name, skill_name')
    .eq('is_published', true)
    .eq('is_broken', false)
    .not('domain_name', 'is', null)
    .not('skill_name', 'is', null)
    .limit(10_000);

  const seen = new Set();
  const taxonomy = [];
  for (const r of taxRows ?? []) {
    const key = `${r.domain_name}::${r.skill_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    taxonomy.push({ domain: r.domain_name, skill: r.skill_name });
  }
  taxonomy.sort((a, b) =>
    a.domain === b.domain
      ? a.skill.localeCompare(b.skill)
      : a.domain.localeCompare(b.domain),
  );

  // Concept-tag catalog — only manager+admin see this surface in
  // the rest of the app, so we mirror that gate here. Teachers get
  // an empty list and the builder hides the Tags button entirely.
  const canSeeTags = ['manager', 'admin'].includes(profile.role);
  let conceptTags = [];
  if (canSeeTags) {
    const { data: tagRows } = await supabase
      .from('concept_tags')
      .select('id, name')
      .order('name', { ascending: true });
    conceptTags = tagRows ?? [];
  }

  return (
    <main className={s.container}>
      <nav className={s.breadcrumb}>
        <Link href="/tutor/lesson-packs">← Lesson packs</Link>
      </nav>

      <LessonPackBuilder
        pack={{
          id: pack.id,
          name: pack.name,
          description: pack.description,
        }}
        initialQuestions={packQuestions}
        initialLibrary={{
          rows: libraryRows ?? [],
          total: libraryTotal ?? 0,
          page: 1,
          pageSize: INITIAL_LIBRARY_PAGE_SIZE,
        }}
        taxonomy={taxonomy}
        conceptTags={conceptTags}
      />
    </main>
  );
}
