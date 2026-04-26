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
      composite_score, rw_scaled, math_scaled,
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

  const moduleAttemptList = moduleAttempts ?? [];
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
        attempt:attempts(id, is_correct, selected_option_id, response_text, time_spent_ms, created_at)
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
    for (const it of items) {
      globalOrdinal += 1;
      const q = questionsById.get(it.question_id);
      const ia = itemAttemptByItemId.get(it.id);
      const a = ia?.attempt ?? null;

      if (!q) {
        reviewItems.push({
          ordinal: globalOrdinal,
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
          selectedOptionId: !isSpr ? a.response_text : null,
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
  const timing = buildTiming(reviewItems, moduleAttemptList);

  // 8b) Saved Desmos states for math review items.
  const mathQids = reviewItems
    .filter((it) => !it.missing && MATH_DOMAINS.has(it.taxonomy?.domain_code ?? ''))
    .map((it) => it.questionId);
  if (mathQids.length > 0) {
    const { data: savedRows } = await supabase
      .from('desmos_saved_states')
      .select('question_id, state_json')
      .in('question_id', mathQids);
    const byQid = new Map((savedRows ?? []).map((r) => [r.question_id, r.state_json]));
    for (const it of reviewItems) {
      if (!it.missing && MATH_DOMAINS.has(it.taxonomy?.domain_code ?? '')) {
        it.desmosSavedState = byQid.get(it.questionId) ?? null;
      }
    }
  }
  const desmosCanSave = viewerRole === 'manager' || viewerRole === 'admin';

  // 8b2) Question notes — org-scoped tutor notes. The loader
  //      walks manager_teacher_assignments + returns canView=false
  //      for student callers.
  const presentQids = reviewItems.filter((it) => !it.missing).map((it) => it.questionId);
  const notesBundle = await loadQuestionNotesByQuestion({
    questionIds: presentQids,
    role: viewerRole,
    userId: viewerUserId,
  });
  if (notesBundle.canView) {
    for (const it of reviewItems) {
      if (!it.missing) it.questionNotes = notesBundle.notesByQid.get(it.questionId) ?? [];
    }
  }

  // 8c) Concept tags catalog + per-item links — manager/admin only.
  const conceptTagsCanTag = viewerRole === 'manager' || viewerRole === 'admin';
  const conceptTagsCanDelete = viewerRole === 'admin';
  let conceptTagsCatalog = null;
  if (conceptTagsCanTag) {
    const [{ data: catalog }, { data: links }] = await Promise.all([
      supabase
        .from('concept_tags')
        .select('id, name')
        .order('name', { ascending: true }),
      presentQids.length > 0
        ? supabase
            .from('question_concept_tags')
            .select('question_id, tag_id')
            .in('question_id', presentQids)
        : Promise.resolve({ data: [] }),
    ]);
    conceptTagsCatalog = catalog ?? [];
    const tagsByQid = new Map();
    for (const r of links ?? []) {
      const arr = tagsByQid.get(r.question_id) ?? [];
      arr.push(r.tag_id);
      tagsByQid.set(r.question_id, arr);
    }
    for (const it of reviewItems) {
      if (!it.missing) it.conceptTagIds = tagsByQid.get(it.questionId) ?? [];
    }
  }

  // 9) Teacher profile for the PDF header.
  let teacher = null;
  if (teacherAssignment?.teacher_id) {
    const { data: tp } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', teacherAssignment.teacher_id)
      .maybeSingle();
    if (tp) {
      teacher = {
        name: [tp.first_name, tp.last_name].filter(Boolean).join(' ') || null,
        email: tp.email ?? null,
      };
    }
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
      testName: attempt.practice_test?.name ?? 'Practice Test',
      testCode: attempt.practice_test?.code ?? '',
      status: attempt.status,
      startedAt: attempt.started_at,
      finishedAt: attempt.finished_at,
      composite: attempt.composite_score,
      sections,
      domains,
      opportunity,
      timing,
      reviewItems,
      pdfData,
      desmosCanSave,
      conceptTagsCatalog,
      conceptTagsCanTag,
      conceptTagsCanDelete,
      questionNotesCanView: notesBundle.canView,
      questionNotesIsAdmin: notesBundle.isAdmin,
      currentUserId: viewerUserId,
    },
  };
}

// ──────────────────────────────────────────────────────────────
// Aggregations.
// ──────────────────────────────────────────────────────────────

function buildSections(attempt, items, moduleAttemptList) {
  const counts = { RW: { correct: 0, total: 0 }, MATH: { correct: 0, total: 0 } };
  for (const it of items) {
    const k = it.subject;
    if (!counts[k]) continue;
    counts[k].total += 1;
    if (it.studentAnswer?.isCorrect) counts[k].correct += 1;
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
    },
    MATH: {
      scaled: attempt.math_scaled,
      correct: counts.MATH.correct,
      total: counts.MATH.total,
      routeCode: routeBySubject.MATH,
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

function buildTiming(items, moduleAttempts) {
  const rwTimed = [];
  const mathTimed = [];
  const bySubject = {
    RW:   { totalMs: 0, count: 0 },
    MATH: { totalMs: 0, count: 0 },
  };
  const byDifficulty = new Map();
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
      const diff = it.taxonomy?.difficulty;
      if (diff != null) {
        const entry = byDifficulty.get(diff) ?? { totalMs: 0, count: 0 };
        entry.totalMs += ms;
        entry.count += 1;
        byDifficulty.set(diff, entry);
      }
      if (it.subject === 'RW') rwTimed.push({ ordinal: it.ordinal, ms });
      else if (it.subject === 'MATH') mathTimed.push({ ordinal: it.ordinal, ms });
    }
  }
  rwTimed.sort((a, b) => b.ms - a.ms);
  mathTimed.sort((a, b) => b.ms - a.ms);

  const moduleRows = [];
  let totalWallMs = 0;
  for (const ma of moduleAttempts ?? []) {
    const m = ma.practice_test_module;
    if (!m) continue;
    const startMs = ma.started_at ? new Date(ma.started_at).getTime() : null;
    const endMs   = ma.finished_at ? new Date(ma.finished_at).getTime() : null;
    const usedMs  = (startMs != null && endMs != null && endMs > startMs)
      ? endMs - startMs
      : null;
    if (usedMs != null) totalWallMs += usedMs;
    moduleRows.push({
      subject: m.subject_code,
      moduleNumber: m.module_number,
      routeCode: m.route_code,
      usedMs,
      allottedMs: m.time_limit_seconds != null ? m.time_limit_seconds * 1000 : null,
    });
  }

  const diffRows = Array.from(byDifficulty.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([difficulty, v]) => ({
      difficulty,
      count: v.count,
      totalMs: v.totalMs,
      avgMs: v.count > 0 ? Math.round(v.totalMs / v.count) : null,
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
    byDifficulty: diffRows,
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
      RW:   { scaled: sections.RW.scaled,   correct: sections.RW.correct,   total: sections.RW.total },
      MATH: { scaled: sections.MATH.scaled, correct: sections.MATH.correct, total: sections.MATH.total },
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
        subject_code: it.subject,
        module_number: it.moduleNumber,
        domain_name: it.taxonomy?.domain_name ?? '',
        skill_name: it.taxonomy?.skill_name ?? '',
        difficulty: it.taxonomy?.difficulty ?? null,
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
