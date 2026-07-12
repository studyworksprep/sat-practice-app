// Practice-test results loader. Used by both the (student)-tree
// page (the student viewing their own attempt) and the (tutor)-tree
// page (a teacher / manager / admin viewing one of their students'
// attempts). The loader does the data fetching + view-model build;
// each tree's page handles routing decisions (redirect non-students,
// redirect in-progress to the runner, etc.) based on the result
// envelope.
//
// Returns one of:
//   { ok: true, props }                — spread into <TestResultsInteractive />
//   { ok: false, code: 'not-found' }   — caller calls notFound()
//   { ok: false, code: 'in-progress',
//     attemptId }                      — caller redirects to the runner
//
// Visibility is enforced by RLS on practice_test_attempts_v2
// (can_view(user_id)). When the viewer can't see the attempt, the
// row lookup returns null and the loader signals 'not-found'.
//
// Important: studentProfile + teacherAssignment are keyed off
// `attempt.user_id` (the owner / student), not the viewer. The
// PDF header carries the student's name + the student's assigned
// teacher, no matter who's viewing.

import { applyWatermark } from '@/lib/content/watermark';
import { extractMcqCorrectId, formatSprCorrect } from '@/lib/practice/correct-answer';
import { loadQuestionNotesByQuestion } from '@/lib/practice/load-question-notes';
import { loadStudentNotesByQuestion } from '@/app/(student)/notes/loaders';
import { inferLayoutMode } from '@/lib/ui/question-layout';

// Opportunity-index weight tables. Mirror the legacy route's
// constants so the v2 OI scores line up with the live site.
const EASE_WEIGHT = { 1: 2.2, 2: 2.0, 3: 1.8, 4: 1.6, 5: 1.4, 6: 1.2, 7: 1.0 };
const MODULE_WEIGHT_EASY = { 1: 1.0, 2: 0.25 };
const MODULE_WEIGHT_HARD = { 1: 1.0, 2: 1.0 };

const MATH_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

/**
 * @param {object} args
 * @param {object} args.supabase     - RLS-scoped Supabase client.
 * @param {string} args.attemptId    - practice_test_attempts_v2.id
 * @param {string} args.viewerUserId - the actual person viewing (for
 *                                     watermark + role-gated panels).
 * @param {string} args.viewerRole   - 'student' | 'teacher' | 'manager' | 'admin'
 */
export async function loadTestResults({ supabase, attemptId, viewerUserId, viewerRole }) {
  // 1) Attempt + test meta. RLS handles visibility — null = not visible.
  const { data: attempt } = await supabase
    .from('practice_test_attempts_v2')
    .select(`
      id, user_id, status, started_at, finished_at,
      composite_score, rw_scaled, math_scaled, sections_only,
      practice_test_id, time_multiplier,
      practice_test:practice_tests_v2(id, code, name)
    `)
    .eq('id', attemptId)
    .maybeSingle();
  if (!attempt) return { ok: false, code: 'not-found' };
  if (attempt.status === 'in_progress') {
    return { ok: false, code: 'in-progress', attemptId };
  }

  const ownerUserId = attempt.user_id;

  // 2) Module attempts, owner profile, owner's teacher, learnability.
  const [
    { data: moduleAttempts },
    { data: studentProfile },
    { data: teacherAssignment },
    { data: learnRows },
  ] = await Promise.all([
    supabase
      .from('practice_test_module_attempts_v2')
      .select(`
        id, correct_count, raw_score, started_at, finished_at,
        practice_test_module:practice_test_modules_v2(
          id, subject_code, module_number, route_code, time_limit_seconds
        )
      `)
      .eq('practice_test_attempt_id', attemptId)
      .order('started_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('first_name, last_name, email, high_school, graduation_year, target_sat_score')
      .eq('id', ownerUserId)
      .maybeSingle(),
    supabase
      .from('teacher_student_assignments')
      .select('teacher_id')
      .eq('student_id', ownerUserId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('skill_learnability')
      .select('skill_code, learnability'),
  ]);

  const learnMap = new Map(
    (learnRows ?? []).map((r) => [r.skill_code, r.learnability]),
  );

  // Order modules deterministically: started_at ascending, then
  // RW before MATH, then module 1 before module 2. The SQL `.order`
  // by started_at alone is ambiguous for Bluebook uploads and v1
  // imports — every module attempt shares the same timestamp, so the
  // DB returns them in undefined order and the review grid ends up
  // interleaving subjects (e.g. Math M1, RW M1, RW M2, Math M2).
  const SUBJECT_ORDER = { RW: 0, MATH: 1 };
  const moduleAttemptList = (moduleAttempts ?? []).slice().sort((a, b) => {
    const ta = a.started_at ? new Date(a.started_at).getTime() : 0;
    const tb = b.started_at ? new Date(b.started_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    const sa = SUBJECT_ORDER[a.practice_test_module?.subject_code] ?? 99;
    const sb = SUBJECT_ORDER[b.practice_test_module?.subject_code] ?? 99;
    if (sa !== sb) return sa - sb;
    return (a.practice_test_module?.module_number ?? 0) - (b.practice_test_module?.module_number ?? 0);
  });
  const moduleIds = moduleAttemptList.map((ma) => ma.practice_test_module?.id).filter(Boolean);

  const [{ data: moduleItems }, { data: itemAttempts }] = await Promise.all([
    supabase
      .from('practice_test_module_items_v2')
      .select('id, practice_test_module_id, ordinal, question_id')
      .in('practice_test_module_id', moduleIds.length ? moduleIds : ['00000000-0000-0000-0000-000000000000']),
    supabase
      .from('practice_test_item_attempts_v2')
      .select(`
        practice_test_module_attempt_id,
        practice_test_module_item_id,
        marked_for_review,
        attempt:attempts(id, is_correct, response_text, time_spent_ms, created_at)
      `)
      .in('practice_test_module_attempt_id',
        moduleAttemptList.map((ma) => ma.id).filter(Boolean).length
          ? moduleAttemptList.map((ma) => ma.id)
          : ['00000000-0000-0000-0000-000000000000']),
  ]);

  // 3) All questions referenced, single IN.
  const allQuestionIds = Array.from(
    new Set((moduleItems ?? []).map((it) => it.question_id).filter(Boolean)),
  );
  let questions = [];
  if (allQuestionIds.length > 0) {
    const { data } = await supabase
      .from('questions_v2')
      .select(
        'id, question_type, stimulus_html, stem_html, options, stimulus_rendered, stem_rendered, options_rendered, rationale_html, rationale_rendered, correct_answer, domain_code, domain_name, skill_code, skill_name, difficulty, score_band, display_code',
      )
      .in('id', allQuestionIds);
    questions = data ?? [];
  }
  const questionsById = new Map(questions.map((q) => [q.id, q]));

  const itemAttemptByItemId = new Map();
  for (const ia of itemAttempts ?? []) {
    itemAttemptByItemId.set(ia.practice_test_module_item_id, ia);
  }

  const itemsByModule = new Map();
  for (const it of moduleItems ?? []) {
    const arr = itemsByModule.get(it.practice_test_module_id) ?? [];
    arr.push(it);
    itemsByModule.set(it.practice_test_module_id, arr);
  }
  for (const [, arr] of itemsByModule) {
    arr.sort((a, b) => a.ordinal - b.ordinal);
  }

  // 4) Flat per-question view model in test order. Watermark uses
  //    the VIEWER's id — if a tutor copies a question off the page,
  //    the embedded id should identify the tutor (the leaker), not
  //    the student.
  const reviewItems = [];
  let globalOrdinal = 0;
  for (const ma of moduleAttemptList) {
    const m = ma.practice_test_module;
    if (!m) continue;
    const items = itemsByModule.get(m.id) ?? [];
    let modulePosition = 0;
    for (const it of items) {
      globalOrdinal += 1;
      modulePosition += 1;
      const q = questionsById.get(it.question_id);
      const ia = itemAttemptByItemId.get(it.id);
      const a = ia?.attempt ?? null;

      if (!q) {
        reviewItems.push({
          ordinal: globalOrdinal,
          modulePosition,
          missing: true,
          moduleItemId: it.id,
          subject: m.subject_code,
          moduleNumber: m.module_number,
          routeCode: m.route_code,
          status: a ? (a.is_correct ? 'correct' : 'incorrect') : 'unanswered',
          marked: !!ia?.marked_for_review,
        });
        continue;
      }

      const isSpr = q.question_type === 'spr';
      const stimulusHtml = applyWatermark(q.stimulus_rendered ?? q.stimulus_html, viewerUserId);
      const stemHtml     = applyWatermark(q.stem_rendered ?? q.stem_html, viewerUserId);
      const optionsSource = Array.isArray(q.options_rendered)
        ? q.options_rendered
        : Array.isArray(q.options) ? q.options : [];
      const options = optionsSource.map((opt, idx) => {
        const label = opt.label ?? opt.id ?? String.fromCharCode(65 + idx);
        const content = opt.content_html_rendered ?? opt.content_html ?? opt.text ?? '';
        return { id: label, ordinal: idx, label, content_html: applyWatermark(content, viewerUserId) };
      });

      reviewItems.push({
        ordinal: globalOrdinal,
        modulePosition,
        missing: false,
        moduleItemId: it.id,
        questionId: q.id,
        externalId: q.display_code,
        questionType: q.question_type,
        stimulusHtml,
        stemHtml,
        options,
        layout: inferLayoutMode(q.domain_code),
        subject: m.subject_code,
        moduleNumber: m.module_number,
        routeCode: m.route_code,
        taxonomy: {
          domain_code: q.domain_code,
          domain_name: q.domain_name,
          skill_code: q.skill_code,
          skill_name: q.skill_name,
          difficulty: q.difficulty,
          score_band: q.score_band,
        },
        studentAnswer: a ? {
          selectedOptionId: !isSpr ? (a.response_text || null) : null,
          responseText: isSpr ? a.response_text : null,
          isCorrect: a.is_correct,
          timeSpentMs: a.time_spent_ms ?? null,
          submittedAt: a.created_at,
        } : null,
        reveal: {
          correctOptionId: !isSpr ? extractMcqCorrectId(q.correct_answer) : null,
          correctAnswerDisplay: isSpr ? formatSprCorrect(q.correct_answer) : null,
          rationaleHtml: applyWatermark(q.rationale_rendered ?? q.rationale_html, viewerUserId),
        },
        status: a ? (a.is_correct ? 'correct' : 'incorrect') : 'unanswered',
        marked: !!ia?.marked_for_review,
      });
    }
  }

  // 5–8) Aggregations.
  const domains = buildDomainStats(reviewItems);
  const sections = buildSections(attempt, reviewItems, moduleAttemptList);
  const opportunity = buildOpportunity(reviewItems, sections, learnMap);
  const timing = buildTiming(reviewItems, moduleAttemptList, attempt.time_multiplier);

  // 8b–9) Item decorations + teacher profile. Six independent
  // lookups (Desmos states, tutor question notes, owner error notes,
  // student notes, concept-tag catalog + links, teacher profile) that
  // each decorate reviewItems from a different table — fetched
  // concurrently; they used to run as a serial tail of round-trips.
  const mathQids = reviewItems
    .filter((it) => !it.missing && MATH_DOMAINS.has(it.taxonomy?.domain_code ?? ''))
    .map((it) => it.questionId);
  const presentQids = reviewItems.filter((it) => !it.missing).map((it) => it.questionId);
  const desmosCanSave = viewerRole === 'manager' || viewerRole === 'admin';
  const conceptTagsCanTag = viewerRole === 'manager' || viewerRole === 'admin';
  const conceptTagsCanDelete = viewerRole === 'admin';

  const [
    { data: savedRows },
    notesBundle,
    { data: errorNoteRows },
    studentNotesByQid,
    { data: conceptCatalog },
    { data: conceptLinks },
    { data: teacherProfileRow },
  ] = await Promise.all([
    // SAT practice-test results loader; ACT practice tests have their
    // own loader path (act_practice_test_attempts).
    mathQids.length > 0
      ? supabase
          .from('desmos_saved_states')
          .select('question_id, state_json')
          .in('question_id', mathQids)
          .eq('test_type', 'sat')
      : Promise.resolve({ data: [] }),
    // Org-scoped tutor notes. The loader walks
    // manager_teacher_assignments + returns canView=false for
    // student callers.
    loadQuestionNotesByQuestion({
      questionIds: presentQids,
      role: viewerRole,
      userId: viewerUserId,
    }),
    // Per-question error-log notes for the attempt owner. Owner-only
    // RLS on question_error_notes means a tutor viewing a student's
    // attempt sees nothing here (and the client gates the editor
    // button on isViewerOwner regardless).
    presentQids.length > 0
      ? supabase
          .from('question_error_notes')
          .select('question_id, body, updated_at')
          .eq('user_id', ownerUserId)
          .in('question_id', presentQids)
          .eq('test_type', 'sat')
      : Promise.resolve({ data: [] }),
    // Student-private rich-text notes for the per-question popover.
    // Owner-only RLS via the helper scopes the read to the caller.
    presentQids.length > 0
      ? loadStudentNotesByQuestion(supabase, presentQids)
      : Promise.resolve(new Map()),
    // Concept tags catalog + per-item links — manager/admin only.
    // question_concept_tags.question_id has been v2-keyed since the
    // v1→v2 question migration backfilled it.
    conceptTagsCanTag
      ? supabase.from('concept_tags').select('id, name').order('name', { ascending: true })
      : Promise.resolve({ data: null }),
    conceptTagsCanTag && presentQids.length > 0
      ? supabase
          .from('question_concept_tags')
          .select('question_id, tag_id')
          .in('question_id', presentQids)
      : Promise.resolve({ data: [] }),
    // Teacher profile for the PDF header.
    teacherAssignment?.teacher_id
      ? supabase
          .from('profiles')
          .select('first_name, last_name, email')
          .eq('id', teacherAssignment.teacher_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  {
    const byQid = new Map((savedRows ?? []).map((r) => [r.question_id, r.state_json]));
    for (const it of reviewItems) {
      if (!it.missing && MATH_DOMAINS.has(it.taxonomy?.domain_code ?? '')) {
        it.desmosSavedState = byQid.get(it.questionId) ?? null;
      }
    }
  }

  if (notesBundle.canView) {
    for (const it of reviewItems) {
      if (!it.missing) it.questionNotes = notesBundle.notesByQid.get(it.questionId) ?? [];
    }
  }

  {
    const byQid = new Map(
      (errorNoteRows ?? []).map((r) => [
        r.question_id,
        { body: r.body, updatedAt: r.updated_at },
      ]),
    );
    for (const it of reviewItems) {
      if (!it.missing) it.errorNote = byQid.get(it.questionId) ?? null;
    }
  }

  for (const it of reviewItems) {
    if (!it.missing) it.studentNote = studentNotesByQid.get(it.questionId) ?? null;
  }

  let conceptTagsCatalog = null;
  if (conceptTagsCanTag) {
    conceptTagsCatalog = conceptCatalog ?? [];
    const tagsByQid = new Map();
    for (const r of conceptLinks ?? []) {
      const arr = tagsByQid.get(r.question_id) ?? [];
      if (!arr.includes(r.tag_id)) arr.push(r.tag_id);
      tagsByQid.set(r.question_id, arr);
    }
    for (const it of reviewItems) {
      if (!it.missing) it.conceptTagIds = tagsByQid.get(it.questionId) ?? [];
    }
  }

  let teacher = null;
  if (teacherProfileRow) {
    teacher = {
      name: [teacherProfileRow.first_name, teacherProfileRow.last_name]
        .filter(Boolean).join(' ') || null,
      email: teacherProfileRow.email ?? null,
    };
  }

  // 10) PDF data payload — shaped to match the legacy JSON the
  //     existing generateScoreReportPdf consumes.
  const pdfData = buildPdfPayload({
    attempt, sections, domains, opportunity, reviewItems, studentProfile, teacher,
  });

  return {
    ok: true,
    props: {
      attemptId,
      practiceTestId: attempt.practice_test_id ?? null,
      testName: attempt.practice_test?.name ?? 'Practice Test',
      testCode: attempt.practice_test?.code ?? '',
      status: attempt.status,
      startedAt: attempt.started_at,
      finishedAt: attempt.finished_at,
      composite: attempt.composite_score,
      sectionsOnly: attempt.sections_only ?? null,
      sections,
      domains,
      opportunity,
      timing,
      reviewItems,
      pdfData,
      viewerRole,
      desmosCanSave,
      conceptTagsCatalog,
      conceptTagsCanTag,
      conceptTagsCanDelete,
      questionNotesCanView: notesBundle.canView,
      questionNotesIsAdmin: notesBundle.isAdmin,
      currentUserId: viewerUserId,
      isViewerOwner: viewerUserId === ownerUserId,
    },
  };
}

// ──────────────────────────────────────────────────────────────
// Aggregations.
// ──────────────────────────────────────────────────────────────

function buildSections(attempt, items, moduleAttemptList) {
  const counts = { RW: { correct: 0, total: 0 }, MATH: { correct: 0, total: 0 } };
  // Per-module correct + total — needed by the Recalculate Score
  // dialog so the tutor can edit (m1, m2) counts before submitting,
  // and by the score_conversion lookup which keys on (m1, m2).
  const perModule = {
    RW:   { m1Correct: 0, m1Total: 0, m2Correct: 0, m2Total: 0 },
    MATH: { m1Correct: 0, m1Total: 0, m2Correct: 0, m2Total: 0 },
  };
  for (const it of items) {
    const k = it.subject;
    if (!counts[k]) continue;
    counts[k].total += 1;
    if (it.studentAnswer?.isCorrect) counts[k].correct += 1;
    const slot = perModule[k];
    if (it.moduleNumber === 1) {
      slot.m1Total += 1;
      if (it.studentAnswer?.isCorrect) slot.m1Correct += 1;
    } else if (it.moduleNumber === 2) {
      slot.m2Total += 1;
      if (it.studentAnswer?.isCorrect) slot.m2Correct += 1;
    }
  }
  const routeBySubject = { RW: 'std', MATH: 'std' };
  for (const ma of moduleAttemptList) {
    const m = ma.practice_test_module;
    if (m?.module_number === 2 && routeBySubject[m.subject_code] != null) {
      routeBySubject[m.subject_code] = m.route_code ?? 'std';
    }
  }
  return {
    RW: {
      scaled: attempt.rw_scaled,
      correct: counts.RW.correct,
      total: counts.RW.total,
      routeCode: routeBySubject.RW,
      ...perModule.RW,
    },
    MATH: {
      scaled: attempt.math_scaled,
      correct: counts.MATH.correct,
      total: counts.MATH.total,
      routeCode: routeBySubject.MATH,
      ...perModule.MATH,
    },
  };
}

function buildDomainStats(items) {
  const byDomain = new Map();
  for (const it of items) {
    if (it.missing) continue;
    const t = it.taxonomy;
    if (!t?.domain_name) continue;
    let d = byDomain.get(t.domain_name);
    if (!d) {
      d = {
        subject_code: it.subject,
        domain_code: t.domain_code,
        domain_name: t.domain_name,
        correct: 0,
        total: 0,
        skills: new Map(),
      };
      byDomain.set(t.domain_name, d);
    }
    d.total += 1;
    if (it.studentAnswer?.isCorrect) d.correct += 1;
    if (t.skill_name) {
      const sk = d.skills.get(t.skill_name) ?? {
        skill_code: t.skill_code ?? null,
        skill_name: t.skill_name,
        correct: 0,
        total: 0,
      };
      sk.total += 1;
      if (it.studentAnswer?.isCorrect) sk.correct += 1;
      d.skills.set(t.skill_name, sk);
    }
  }
  return Array.from(byDomain.values())
    .map((d) => ({
      ...d,
      skills: Array.from(d.skills.values()).sort((a, b) => a.skill_name.localeCompare(b.skill_name)),
    }))
    .sort((a, b) => {
      if (a.subject_code !== b.subject_code) return a.subject_code === 'RW' ? -1 : 1;
      return a.domain_name.localeCompare(b.domain_name);
    });
}

function buildOpportunity(items, sections, learnMap) {
  const routeBySubject = {
    RW: isHardRoute(sections.RW?.routeCode) ? 'hard' : 'easy',
    MATH: isHardRoute(sections.MATH?.routeCode) ? 'hard' : 'easy',
  };
  const oi = new Map();
  for (const it of items) {
    if (it.missing) continue;
    const code = it.taxonomy?.skill_code;
    if (!code) continue;
    let entry = oi.get(code);
    if (!entry) {
      entry = {
        skill_code: code,
        skill_name: it.taxonomy.skill_name ?? '',
        domain_name: it.taxonomy.domain_name ?? '',
        subject_code: it.subject,
        learnability: learnMap.get(code) ?? 5,
        rawSum: 0,
        correct: 0,
        total: 0,
      };
      oi.set(code, entry);
    }
    entry.total += 1;
    if (it.studentAnswer?.isCorrect) {
      entry.correct += 1;
    } else {
      const band = it.taxonomy.score_band ?? 4;
      const ease = EASE_WEIGHT[band] ?? 1.6;
      const route = routeBySubject[it.subject] ?? 'easy';
      const mw = route === 'hard'
        ? (MODULE_WEIGHT_HARD[it.moduleNumber] ?? 1.0)
        : (MODULE_WEIGHT_EASY[it.moduleNumber] ?? 1.0);
      entry.rawSum += ease * mw;
    }
  }
  return Array.from(oi.values())
    .map((s) => ({
      skill_code: s.skill_code,
      skill_name: s.skill_name,
      domain_name: s.domain_name,
      subject_code: s.subject_code,
      learnability: s.learnability,
      correct: s.correct,
      total: s.total,
      opportunity_index: Math.round(((s.learnability / 10) * s.rawSum) * 100) / 100,
    }))
    .filter((s) => s.opportunity_index > 0)
    .sort((a, b) => b.opportunity_index - a.opportunity_index);
}

function isHardRoute(routeCode) {
  return routeCode === 'hard';
}

function buildTiming(items, moduleAttempts, timeMultiplier) {
  // Apply the attempt's time-accommodation multiplier to each
  // module's allotment so the "X used of Y" label matches the
  // time the student actually had. Without this, a 1.5× student
  // on a 32m module would see "38m used of 32m" even though
  // they had 48m and finished early.
  const mult = Number.isFinite(Number(timeMultiplier)) && Number(timeMultiplier) > 0
    ? Number(timeMultiplier)
    : 1;
  const rwTimed = [];
  const mathTimed = [];
  const bySubject = {
    RW:   { totalMs: 0, count: 0 },
    MATH: { totalMs: 0, count: 0 },
  };
  const byScoreBand = new Map();
  let totalAnswerMs = 0;
  let answerCount = 0;
  for (const it of items) {
    if (it.missing) continue;
    const ms = it.studentAnswer?.timeSpentMs;
    if (ms != null && ms > 0) {
      totalAnswerMs += ms;
      answerCount += 1;
      if (bySubject[it.subject]) {
        bySubject[it.subject].totalMs += ms;
        bySubject[it.subject].count += 1;
      }
      const band = it.taxonomy?.score_band;
      if (band != null) {
        const entry = byScoreBand.get(band) ?? { totalMs: 0, count: 0, correct: 0 };
        entry.totalMs += ms;
        entry.count += 1;
        if (it.studentAnswer?.isCorrect) entry.correct += 1;
        byScoreBand.set(band, entry);
      }
      const row = {
        ordinal: it.ordinal,
        modulePosition: it.modulePosition,
        moduleNumber: it.moduleNumber,
        ms,
      };
      if (it.subject === 'RW') rwTimed.push(row);
      else if (it.subject === 'MATH') mathTimed.push(row);
    }
  }
  rwTimed.sort((a, b) => b.ms - a.ms);
  mathTimed.sort((a, b) => b.ms - a.ms);

  // Sum per-question time_spent_ms by (subject, moduleNumber)
  // as a fallback when the per-module wall-time clock isn't
  // usable (older v1 attempts that didn't capture started_at /
  // finished_at properly, imported attempts where the migration
  // collapsed the timestamps, etc.). Keyed identically to how
  // the moduleRows below identify themselves.
  const perQTimeByModule = new Map();
  for (const it of items) {
    if (it.missing) continue;
    const ms = it.studentAnswer?.timeSpentMs;
    if (ms == null || ms <= 0) continue;
    const key = `${it.subject}__${it.moduleNumber}`;
    perQTimeByModule.set(key, (perQTimeByModule.get(key) ?? 0) + ms);
  }

  const moduleRows = [];
  let totalWallMs = 0;
  for (const ma of moduleAttempts ?? []) {
    const m = ma.practice_test_module;
    if (!m) continue;
    const startMs = ma.started_at ? new Date(ma.started_at).getTime() : null;
    const endMs   = ma.finished_at ? new Date(ma.finished_at).getTime() : null;
    const wallMs  = (startMs != null && endMs != null && endMs > startMs)
      ? endMs - startMs
      : null;
    // Fall back to summing per-question time when the wall clock
    // was never recorded. Tagged with `usedMsSource` so the
    // renderer can label the row honestly ("answer time" vs
    // "wall time") if it wants to.
    const summedMs = perQTimeByModule.get(`${m.subject_code}__${m.module_number}`) ?? 0;
    const usedMs   = wallMs ?? (summedMs > 0 ? summedMs : null);
    const usedMsSource = wallMs != null ? 'wall' : (summedMs > 0 ? 'answers' : null);
    if (usedMs != null) totalWallMs += usedMs;
    moduleRows.push({
      subject: m.subject_code,
      moduleNumber: m.module_number,
      routeCode: m.route_code,
      usedMs,
      usedMsSource,
      allottedMs: m.time_limit_seconds != null
        ? Math.round(m.time_limit_seconds * 1000 * mult)
        : null,
    });
  }

  const bandRows = Array.from(byScoreBand.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([scoreBand, v]) => ({
      scoreBand,
      count: v.count,
      correct: v.correct,
      totalMs: v.totalMs,
      avgMs: v.count > 0 ? Math.round(v.totalMs / v.count) : null,
      accuracyPct: v.count > 0 ? Math.round((v.correct / v.count) * 100) : null,
    }));

  return {
    anyTimed: answerCount > 0 || moduleRows.some((m) => m.usedMs != null),
    totalAnswerMs,
    totalWallMs,
    answerCount,
    bySubject: {
      RW: {
        ...bySubject.RW,
        avgMs: bySubject.RW.count > 0
          ? Math.round(bySubject.RW.totalMs / bySubject.RW.count)
          : null,
      },
      MATH: {
        ...bySubject.MATH,
        avgMs: bySubject.MATH.count > 0
          ? Math.round(bySubject.MATH.totalMs / bySubject.MATH.count)
          : null,
      },
    },
    byScoreBand: bandRows,
    byModule: moduleRows,
    slowestRw:   rwTimed.slice(0, 5),
    slowestMath: mathTimed.slice(0, 5),
  };
}

function buildPdfPayload({ attempt, sections, domains, opportunity, reviewItems, studentProfile, teacher }) {
  return {
    test_name: attempt.practice_test?.name ?? '',
    test_code: attempt.practice_test?.code ?? '',
    completed_at: attempt.finished_at,
    composite: attempt.composite_score,
    sections: {
      RW: {
        scaled: sections.RW.scaled,
        correct: sections.RW.correct,
        total: sections.RW.total,
        routeCode: sections.RW.routeCode ?? null,
      },
      MATH: {
        scaled: sections.MATH.scaled,
        correct: sections.MATH.correct,
        total: sections.MATH.total,
        routeCode: sections.MATH.routeCode ?? null,
      },
    },
    domains: domains.map((d) => ({
      subject_code: d.subject_code,
      domain_name: d.domain_name,
      correct: d.correct,
      total: d.total,
      skills: d.skills.map((sk) => ({
        skill_name: sk.skill_name,
        correct: sk.correct,
        total: sk.total,
      })),
    })),
    opportunity: opportunity.slice(0, 10),
    questions: reviewItems.filter((it) => !it.missing).map((it) => {
      const sa = it.studentAnswer;
      return {
        ordinal: it.ordinal,
        module_position: it.modulePosition,
        subject_code: it.subject,
        module_number: it.moduleNumber,
        domain_name: it.taxonomy?.domain_name ?? '',
        skill_name: it.taxonomy?.skill_name ?? '',
        difficulty: it.taxonomy?.difficulty ?? null,
        score_band: it.taxonomy?.score_band ?? null,
        time_spent_ms: sa?.timeSpentMs ?? null,
        is_correct: !!sa?.isCorrect,
        was_answered: sa != null,
        options: (it.options ?? []).map((o) => ({ id: o.id, label: o.label })),
        selected_option_id: sa?.selectedOptionId ?? null,
        response_text: sa?.responseText ?? null,
        correct_answer: {
          correct_option_id: it.reveal.correctOptionId,
          correct_text: it.reveal.correctAnswerDisplay,
        },
      };
    }),
    student: studentProfile ? {
      name: [studentProfile.first_name, studentProfile.last_name].filter(Boolean).join(' ') || null,
      email: studentProfile.email ?? null,
      high_school: studentProfile.high_school ?? null,
      graduation_year: studentProfile.graduation_year ?? null,
      target_sat_score: studentProfile.target_sat_score ?? null,
    } : null,
    teacher,
  };
}
