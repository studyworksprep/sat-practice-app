// ACT-side companion to build-session-review.js. Same return shape so
// the same ReviewInteractive client island can consume either. See
// docs/architecture-plan.md §3.4 — "the fork happens at the loader
// and write-action layer; the page, renderer, and runner stay shared."
//
// Differences absorbed inside this module:
//   - Question content comes from act_questions; options come from
//     act_answer_options (a separate IN-fetch). We synthesize the
//     SAT-shaped question row so the items.map below stays uniform.
//   - Attempts live in act_attempts. selected_option_id is the
//     act_answer_options.id UUID (no response_text — ACT is MCQ-only).
//   - correct_answer is encoded as `{ option_label: <uuid> }` so the
//     existing extractMcqCorrectId helper returns the UUID, which is
//     also the id we use on each option in items[].options — the
//     renderer highlights the matching radio without further branching.
//   - No v1→v2 question id translation. ACT has no legacy era; every
//     question_id is already a native act_questions.id.
//   - No assignment context today. ACT assignments are forward-wired
//     (§3.4) but no surface exists; assignment={ null } keeps the
//     section hidden in the review report.
//   - No concept tags today (SAT-only feature). Future ACT-side
//     tagging would land here.
//   - No Desmos saved-state loading for ACT — math eligibility uses
//     inferred section, and ACT calculator support comes later.

import { applyWatermark } from '@/lib/content/watermark';
import { extractMcqCorrectId } from '@/lib/practice/correct-answer';
import { loadQuestionNotesByQuestion } from '@/lib/practice/load-question-notes';
import { loadStudentNotesByQuestion } from '@/app/(student)/notes/loaders';
import { inferActLayoutMode, sectionLabel } from '@/lib/practice/act-taxonomy';

const ACT_DESMOS_ELIGIBLE_SECTIONS = new Set(['math']);
const ACT_DESMOS_CAN_SAVE_ROLES = new Set(['manager', 'admin']);

/**
 * @param {object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.supabase
 * @param {{ id: string }} args.user
 * @param {{ id: string } | null} [args.target]
 * @param {string} [args.role]
 * @param {{
 *   id: string,
 *   user_id: string,
 *   question_ids: string[],
 *   created_at: string,
 *   mode: string,
 *   filter_criteria: any,
 *   marked_positions?: number[],
 *   test_type: 'act',
 * }} args.session
 */
export async function buildActSessionReview({
  supabase,
  user,
  target = null,
  role = null,
  session,
} = {}) {
  const targetUser = target ?? user;
  const questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];

  const attemptsFloor = session.created_at;

  // 1) ACT question content + options + the student's attempts in parallel.
  const [
    { data: actQuestions },
    { data: actOptions },
    { data: attempts },
  ] = await Promise.all([
    questionIds.length > 0
      ? supabase
          .from('act_questions')
          .select(
            'id, external_id, section, category, category_code, subcategory, subcategory_code, difficulty, question_type, stimulus_html, stem_html, rationale_html, source_ordinal',
          )
          .in('id', questionIds)
      : Promise.resolve({ data: [] }),
    questionIds.length > 0
      ? supabase
          .from('act_answer_options')
          .select('id, question_id, ordinal, label, content_html, is_correct')
          .in('question_id', questionIds)
          .order('ordinal', { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase
      .from('act_attempts')
      .select('question_id, is_correct, selected_option_id, created_at, time_spent_ms')
      .eq('user_id', targetUser.id)
      .in('question_id', questionIds.length > 0 ? questionIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('created_at', attemptsFloor)
      .order('created_at', { ascending: true }),
  ]);

  // Bucket options + locate the correct option per question.
  const optionsByQid = new Map();
  const correctByQid = new Map();
  for (const opt of actOptions ?? []) {
    const arr = optionsByQid.get(opt.question_id) ?? [];
    arr.push(opt);
    optionsByQid.set(opt.question_id, arr);
    if (opt.is_correct) correctByQid.set(opt.question_id, opt.id);
  }

  // Synthesize a SAT-shaped question row per ACT row so the items.map
  // below stays uniform with the SAT side.
  const questionsById = new Map();
  for (const q of actQuestions ?? []) {
    const opts = (optionsByQid.get(q.id) ?? [])
      .slice()
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
    questionsById.set(q.id, {
      id: q.id,
      question_type: q.question_type,
      stimulus_html: q.stimulus_html,
      stem_html: q.stem_html,
      source_ordinal: q.source_ordinal ?? null,
      options: opts.map((o) => ({
        id: o.id,
        label: o.label,
        ordinal: o.ordinal,
        content_html: o.content_html,
      })),
      rationale_html: q.rationale_html,
      // Format matches the v2 SAT shape so extractMcqCorrectId returns
      // the UUID we want highlighted.
      correct_answer: { option_label: correctByQid.get(q.id) ?? null },
      domain_code: q.section,
      domain_name: sectionLabel(q.section),
      skill_code: q.category_code ?? null,
      skill_name: q.category ?? null,
      difficulty: q.difficulty ?? null,
      score_band: null,
      display_code: q.external_id,
    });
  }

  // First-attempt-wins for the primary answer shown; later
  // attempts are collected separately so the report can list
  // re-attempt history beneath it.
  const firstAttemptByQid = new Map();
  const laterAttemptsByQid = new Map();
  for (const a of attempts ?? []) {
    if (!firstAttemptByQid.has(a.question_id)) {
      firstAttemptByQid.set(a.question_id, a);
    } else {
      const arr = laterAttemptsByQid.get(a.question_id) ?? [];
      arr.push(a);
      laterAttemptsByQid.set(a.question_id, arr);
    }
  }

  const markedSet = new Set(
    Array.isArray(session.marked_positions) ? session.marked_positions : [],
  );

  const items = questionIds.map((qid, position) => {
    const q = questionsById.get(qid);
    const a = firstAttemptByQid.get(qid) ?? null;
    const marked = markedSet.has(position);

    if (!q) {
      return {
        position,
        questionId: qid,
        missing: true,
        status: a ? (a.is_correct ? 'correct' : 'incorrect') : 'unanswered',
        externalId: null,
        questionType: null,
        marked,
      };
    }

    const stimulusHtml = applyWatermark(q.stimulus_html ?? '', targetUser.id);
    const stemHtml = applyWatermark(q.stem_html ?? '', targetUser.id);

    const options = (q.options ?? []).map((opt, idx) => ({
      id: opt.id,
      ordinal: idx,
      label: opt.label,
      content_html: applyWatermark(opt.content_html ?? '', targetUser.id),
    }));

    return {
      position,
      questionId: qid,
      missing: false,
      externalId: q.display_code,
      questionType: q.question_type,
      stimulusHtml,
      stemHtml,
      options,
      layout: inferActLayoutMode(q.domain_code),
      taxonomy: {
        domain_code: q.domain_code,
        domain_name: q.domain_name,
        skill_code: q.skill_code,
        skill_name: q.skill_name,
        difficulty: q.difficulty,
        score_band: q.score_band,
      },
      qrefOrdinal: q.source_ordinal ?? null,
      studentAnswer: a
        ? {
            // ACT is MCQ-only; the option's id is its act_answer_options.id.
            selectedOptionId: a.selected_option_id,
            responseText: null,
            isCorrect: a.is_correct,
            submittedAt: a.created_at,
            timeSpentMs: a.time_spent_ms ?? null,
          }
        : null,
      additionalAttempts: (laterAttemptsByQid.get(qid) ?? []).map((la) => ({
        selectedOptionId: la.selected_option_id,
        responseText: null,
        isCorrect: la.is_correct,
        submittedAt: la.created_at,
        timeSpentMs: la.time_spent_ms ?? null,
      })),
      reveal: {
        correctOptionId: extractMcqCorrectId(q.correct_answer),
        correctAnswerDisplay: null,
        rationaleHtml: applyWatermark(q.rationale_html ?? '', targetUser.id),
      },
      status: a ? (a.is_correct ? 'correct' : 'incorrect') : 'unanswered',
      marked,
    };
  });

  // Per-question Desmos saved states for ACT math items. Plumbs
  // test_type so the loader returns ACT-keyed states once a writer
  // exists; today this typically resolves empty.
  const mathQuestionIds = items
    .filter((it) => !it.missing && ACT_DESMOS_ELIGIBLE_SECTIONS.has(it.taxonomy?.domain_code ?? ''))
    .map((it) => it.questionId);
  if (mathQuestionIds.length > 0) {
    const { data: savedStates } = await supabase
      .from('desmos_saved_states')
      .select('question_id, state_json')
      .in('question_id', mathQuestionIds)
      .eq('test_type', 'act');
    const byQid = new Map((savedStates ?? []).map((r) => [r.question_id, r.state_json]));
    for (const it of items) {
      if (!it.missing && ACT_DESMOS_ELIGIBLE_SECTIONS.has(it.taxonomy?.domain_code ?? '')) {
        it.desmosSavedState = byQid.get(it.questionId) ?? null;
      }
    }
  }

  // Question notes (tutor annotations). The shared loader is plumbed
  // with testType in PR 5.
  const presentQids = items.filter((it) => !it.missing).map((it) => it.questionId);
  const notesBundle = await loadQuestionNotesByQuestion({
    questionIds: presentQids,
    role,
    userId: user.id,
    testType: 'act',
  });
  if (notesBundle.canView) {
    for (const it of items) {
      if (!it.missing) it.questionNotes = notesBundle.notesByQid.get(it.questionId) ?? [];
    }
  }

  // Student-private rich-text notes (popover).
  const studentNotesByQid = await loadStudentNotesByQuestion(supabase, presentQids, 'act');
  for (const it of items) {
    if (!it.missing) {
      it.studentNote = studentNotesByQid.get(it.questionId) ?? null;
    }
  }

  // Error notes (the per-question "why I got this wrong" entries).
  if (presentQids.length > 0) {
    const { data: errorNoteRows } = await supabase
      .from('question_error_notes')
      .select('question_id, body, updated_at')
      .eq('user_id', user.id)
      .in('question_id', presentQids)
      .eq('test_type', 'act');
    const byQid = new Map(
      (errorNoteRows ?? []).map((r) => [
        r.question_id,
        { body: r.body, updatedAt: r.updated_at },
      ]),
    );
    for (const it of items) {
      if (!it.missing) it.errorNote = byQid.get(it.questionId) ?? null;
    }
  }

  const metrics = buildMetrics(items);
  const timing = buildTiming(items);

  return {
    sessionMeta: {
      sessionId: session.id,
      createdAt: session.created_at,
      mode: session.mode,
    },
    items,
    metrics,
    timing,
    assignment: null, // ACT assignments are forward-wired only today.
    desmosCanSave: ACT_DESMOS_CAN_SAVE_ROLES.has(role),
    conceptTagsCatalog: null,
    conceptTagsCanTag: false,
    conceptTagsCanDelete: false,
    questionNotesCanView: notesBundle.canView,
    questionNotesIsAdmin: notesBundle.isAdmin,
    currentUserId: user.id,
  };
}

// ──────────────────────────────────────────────────────────────
// Metrics + timing. Same shape as build-session-review.js — we
// duplicate the small builders rather than export them across
// modules to keep the SAT path unchanged and the ACT path
// independently editable as ACT features land.
// ──────────────────────────────────────────────────────────────

function buildMetrics(items) {
  let total = 0;
  let attempted = 0;
  let correct = 0;
  const byScoreBand = new Map();
  const byDomain = new Map();

  for (const it of items) {
    total += 1;
    if (it.missing) continue;
    const hasAttempt = it.studentAnswer != null;
    if (hasAttempt) {
      attempted += 1;
      if (it.studentAnswer.isCorrect) correct += 1;
    }

    const band = it.taxonomy?.score_band ?? 0;
    const bandEntry = byScoreBand.get(band) ?? { correct: 0, total: 0 };
    bandEntry.total += 1;
    if (hasAttempt && it.studentAnswer.isCorrect) bandEntry.correct += 1;
    byScoreBand.set(band, bandEntry);

    const domainName = it.taxonomy?.domain_name ?? 'Unknown';
    let domainEntry = byDomain.get(domainName);
    if (!domainEntry) {
      domainEntry = {
        name: domainName,
        code: it.taxonomy?.domain_code ?? null,
        correct: 0,
        total: 0,
        skills: new Map(),
      };
      byDomain.set(domainName, domainEntry);
    }
    domainEntry.total += 1;
    if (hasAttempt && it.studentAnswer.isCorrect) domainEntry.correct += 1;

    const skillName = it.taxonomy?.skill_name;
    if (skillName) {
      const skillEntry = domainEntry.skills.get(skillName) ?? { correct: 0, total: 0 };
      skillEntry.total += 1;
      if (hasAttempt && it.studentAnswer.isCorrect) skillEntry.correct += 1;
      domainEntry.skills.set(skillName, skillEntry);
    }
  }

  return {
    total,
    attempted,
    correct,
    accuracy: attempted > 0 ? correct / attempted : null,
    byScoreBand: Array.from(byScoreBand.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([scoreBand, v]) => ({ scoreBand, ...v })),
    byDomain: Array.from(byDomain.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({
        ...d,
        skills: Array.from(d.skills.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([name, v]) => ({ name, ...v })),
      })),
  };
}

function buildTiming(items) {
  const entries = items.map((it) => {
    const ms = it.studentAnswer?.timeSpentMs ?? 0;
    return {
      position: it.position,
      questionId: it.questionId,
      status: it.status,
      timeSpentMs: ms > 0 ? ms : 0,
      domainName: it.taxonomy?.domain_name ?? null,
      skillName: it.taxonomy?.skill_name ?? null,
    };
  });
  const measured = entries.filter((e) => e.timeSpentMs > 0);
  const totalMs = measured.reduce((s, e) => s + e.timeSpentMs, 0);
  const sorted = measured.map((e) => e.timeSpentMs).sort((a, b) => a - b);
  const medianMs = sorted.length
    ? sorted[Math.floor(sorted.length / 2)]
    : 0;
  return {
    entries,
    totalMs,
    medianMs,
    measuredCount: measured.length,
  };
}
