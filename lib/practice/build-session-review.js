// Shared server-side builder for the session-review page. Both
// the student review (/practice/review/[sessionId]) and the tutor
// training-mode review (/tutor/training/practice/review/[sessionId])
// render the same client island (ReviewInteractive) over the same
// view-model — only the role gate and the session-row query differ.
//
// This module owns the rest: per-position view-model with watermarked
// stems / options / rationales, the student's first attempt, reveal
// payload, and the pre-aggregated metrics + timing + assignment
// daily-map. Pages do auth + the session-row lookup themselves so
// they can apply tree-specific filters (mode pinning, role redirects)
// before handing the row to this builder.
//
// The "first attempt wins" rule mirrors what the legacy review page
// did: any follow-up attempts on the same question id (e.g. from a
// later Review re-run) are ignored for this session's report. The
// binding between a session and its attempts is the timestamp range
// — attempts table doesn't carry session_id.

import { applyWatermark } from '@/lib/content/watermark';
import { extractMcqCorrectId, formatSprCorrect } from '@/lib/practice/correct-answer';
import { loadQuestionNotesByQuestion } from '@/lib/practice/load-question-notes';
import { loadStudentNotesByQuestion } from '@/app/(student)/notes/loaders';
import { resolveLegacyQuestionIds } from '@/lib/practice/legacy-id-map';
import { expandToAttemptIds } from '@/lib/practice/weak-queue';
import { inferLayoutMode } from '@/lib/ui/question-layout';
import { buildActSessionReview } from '@/lib/practice/build-act-session-review';

const MATH_DOMAIN_CODES = new Set(['H', 'P', 'Q', 'S']);
const DESMOS_CAN_SAVE_ROLES = new Set(['manager', 'admin']);
const CONCEPT_TAGS_CAN_TAG_ROLES = new Set(['manager', 'admin']);

/**
 * Build the full view-model handed to <ReviewInteractive />.
 *
 * @param {object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.supabase
 * @param {{ id: string }} args.user - the auth'd caller (viewer).
 *   Used for visibility-scoped data like question notes and the
 *   watermark when the viewer is also the session owner.
 * @param {{ id: string }} [args.target] - the owner of the
 *   session being reviewed. For student review and tutor self-
 *   training this equals `user`; for a tutor reviewing a
 *   student's session it's the student. Defaults to `user`.
 *   Drives which user_id the attempts query filters on and
 *   whose identifier the watermark embeds.
 * @param {string} [args.role] - caller's profile.role; controls
 *   whether per-question Desmos states are loaded for the saved-state
 *   button (manager/admin → save; teacher → load only).
 * @param {{
 *   id: string,
 *   user_id: string,
 *   question_ids: string[],
 *   created_at: string,
 *   mode: string,
 *   filter_criteria: any,
 * }} args.session
 * @returns {Promise<{
 *   sessionMeta: { sessionId: string, createdAt: string, mode: string },
 *   items: any[],
 *   metrics: any,
 *   timing: any,
 *   assignment: any | null,
 * }>}
 */
export async function buildSessionReview({
  supabase,
  user,
  target = null,
  role = null,
  session,
  // For synthetic sessions reconstructed from attempts (e.g. the
  // tutor-tree per-trainee assignment report when no v2 session
  // row exists), set this to also pull pre-cutover legacy
  // attempt rows whose question_ids map to the v2 set. Defaults
  // to false so the live runner paths skip the extra round trip.
  expandLegacyIds = false,
} = {}) {
  // Per §3.4, the fork lives at the loader layer. ACT review uses a
  // sibling builder that returns the same view-model — same items[],
  // same metrics shape — so ReviewInteractive consumes either tree
  // transparently.
  if (session?.test_type === 'act') {
    return buildActSessionReview({ supabase, user, target, role, session });
  }

  const targetUser = target ?? user;
  const questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];

  // ── v1 → v2 question id resolution ──────────────────────────
  // Legacy assignments (rows copied or sync-trigger-mirrored from
  // question_assignments) store v1 question uuids on
  // assignments_v2.question_ids untouched. Native v2 assignments
  // store v2 ids. Translate to a single v2-keyed shape so the
  // questions_v2 lookup actually returns rows for legacy
  // assignments — without this, every item rendered as
  // "missing" the moment a flipped student opened a pre-cutover
  // assignment.
  //
  // We keep the original ids around: items.map iterates in the
  // original order and items[i].questionId stays the original
  // (v1 or v2) so existing keying stays stable.
  let v1ToV2 = new Map();
  if (questionIds.length > 0) {
    const { data: idMapRows } = await supabase
      .from('question_id_map')
      .select('old_question_id, new_question_id')
      .in('old_question_id', questionIds);
    v1ToV2 = new Map((idMapRows ?? []).map((r) => [r.old_question_id, r.new_question_id]));
  }
  const v2QueryIds = Array.from(new Set(
    questionIds.map((id) => v1ToV2.get(id) ?? id),
  ));
  // Reverse map: v2 id → original id in questionIds. Lets us
  // bucket attempts (which carry either v1 or v2 ids) back onto
  // the right item in items[].
  const v2ToOrig = new Map();
  for (const orig of questionIds) {
    const v2 = v1ToV2.get(orig) ?? orig;
    v2ToOrig.set(v2, orig);
  }

  // Optionally expand the v2 ids out to also cover legacy v1
  // attempt question_ids that map to the same v2 questions, so
  // pre-cutover work counts toward this report. v2ByLegacy maps
  // each v1 id back to the canonical v2 id we key the rest of
  // the page off.
  let attemptQuestionIds = v2QueryIds;
  let v2ByLegacy = new Map();
  if (expandLegacyIds && v2QueryIds.length > 0) {
    const expanded = await expandToAttemptIds(supabase, v2QueryIds);
    attemptQuestionIds = expanded.allIds;
    v2ByLegacy = expanded.v2ByLegacy;
  }

  // Compute the attempts time-floor. For assignment-tied sessions
  // we widen the window back to whichever is earlier of the
  // session's start time and the assignment's issue date — that
  // way a trainee who works the assignment across multiple
  // sessions (e.g. day 1 + day 2, each its own practice_sessions
  // row) gets every attempt rolled into the same report. For
  // standalone sessions we stay scoped to the session start so
  // older attempts on the same questions don't bleed in.
  const assignmentIdRaw =
    session.filter_criteria
    && typeof session.filter_criteria === 'object'
      ? session.filter_criteria.assignment_id
      : null;
  const assignmentId = typeof assignmentIdRaw === 'string' ? assignmentIdRaw : null;
  let attemptsFloor = session.created_at;
  let assignmentRow = null;
  if (assignmentId) {
    const { data } = await supabase
      .from('assignments_v2')
      .select('id, title, description, assignment_type, question_ids, due_date, created_at')
      .eq('id', assignmentId)
      .maybeSingle();
    assignmentRow = data ?? null;
    if (assignmentRow?.created_at && assignmentRow.created_at < attemptsFloor) {
      attemptsFloor = assignmentRow.created_at;
    }
  }

  // 1) All questions and all attempts in parallel. One IN query
  //    each — we need full content + rationale + correct_answer
  //    for every question because the client island switches
  //    between them without further fetches.
  const [{ data: questions }, { data: attempts }] = await Promise.all([
    supabase
      .from('questions_v2')
      .select(
        'id, question_type, stimulus_html, stem_html, options, stimulus_rendered, stem_rendered, options_rendered, rationale_html, rationale_rendered, correct_answer, domain_code, domain_name, skill_code, skill_name, difficulty, score_band, display_code',
      )
      .in('id', v2QueryIds),
    // Attempts against these questions, scoped to after the session
    // started so attempts from earlier sessions on the same questions
    // don't bleed into this session's report. Attempts don't carry a
    // session_id column, so the timestamp is the binding.
    supabase
      .from('attempts')
      .select('question_id, is_correct, selected_option_id, response_text, created_at, time_spent_ms')
      .eq('user_id', targetUser.id)
      .in('question_id', attemptQuestionIds)
      .gte('created_at', attemptsFloor)
      .order('created_at', { ascending: true }),
  ]);

  // questions_v2 came back keyed by v2 id. Re-key by ORIGINAL
  // qid (whatever shape questionIds actually carry — v1 for
  // legacy assignments, v2 for native ones) so the items.map
  // below can do questionsById.get(originalQid) without caring
  // which era the assignment was authored in.
  const v2ById = new Map((questions ?? []).map((q) => [q.id, q]));
  const questionsById = new Map(
    questionIds.map((origId) => [
      origId,
      v2ById.get(v1ToV2.get(origId) ?? origId),
    ]),
  );

  // First attempt wins — that's the "initial answer" the student
  // gave during the session, which is what the report shows.
  // Subsequent attempts (2nd, 3rd, …) are collected into a
  // separate map so the report can list re-attempt history
  // beneath the primary answer. Normalize each attempt's
  // question_id back to whichever id (v1 or v2) the
  // assignment's questionIds array uses, so attempts and items
  // line up regardless of when the question was answered
  // (pre- or post-cutover).
  const firstAttemptByQid = new Map();
  const laterAttemptsByQid = new Map();
  for (const a of attempts ?? []) {
    // Step 1: attempt's qid → v2 (passes through if it was already v2)
    const v2 = v2ByLegacy.get(a.question_id) ?? a.question_id;
    // Step 2: v2 → original id in questionIds (passes through if
    // the questionIds array already used v2 ids).
    const qKey = v2ToOrig.get(v2) ?? v2;
    if (!firstAttemptByQid.has(qKey)) {
      firstAttemptByQid.set(qKey, a);
    } else {
      const arr = laterAttemptsByQid.get(qKey) ?? [];
      arr.push(a);
      laterAttemptsByQid.set(qKey, arr);
    }
  }

  // Mark-for-review positions live on the session row as int[]
  // (migration 20240101000037). Synthetic-session callers pass an
  // object without marked_positions; treat it as an empty set so
  // those review surfaces just don't show flags.
  const markedSet = new Set(
    Array.isArray(session.marked_positions) ? session.marked_positions : [],
  );

  const items = questionIds.map((qid, position) => {
    const q = questionsById.get(qid);
    const a = firstAttemptByQid.get(qid) ?? null;
    const marked = markedSet.has(position);

    // Question gone from the bank since the session was created —
    // render a placeholder. Rare but possible.
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

    const isSpr = q.question_type === 'spr';

    const stimulusHtml = applyWatermark(
      q.stimulus_rendered ?? q.stimulus_html,
      targetUser.id,
    );
    const stemHtml = applyWatermark(
      q.stem_rendered ?? q.stem_html,
      targetUser.id,
    );

    const optionsSource = Array.isArray(q.options_rendered)
      ? q.options_rendered
      : Array.isArray(q.options)
        ? q.options
        : [];
    const options = optionsSource.map((opt, idx) => {
      const label = opt.label ?? opt.id ?? String.fromCharCode(65 + idx);
      const content = opt.content_html_rendered ?? opt.content_html ?? opt.text ?? '';
      return {
        id: label,
        ordinal: idx,
        label,
        content_html: applyWatermark(content, targetUser.id),
      };
    });

    return {
      position,
      questionId: qid,
      missing: false,
      externalId: q.display_code,
      questionType: q.question_type,
      stimulusHtml,
      stemHtml,
      options,
      layout: inferLayoutMode(q.domain_code),
      taxonomy: {
        domain_code: q.domain_code,
        domain_name: q.domain_name,
        skill_code: q.skill_code ?? null,
        skill_name: q.skill_name,
        difficulty: q.difficulty,
        score_band: q.score_band,
      },
      // Student's initial answer. For MCQ, response_text carries the
      // option letter (A/B/C/D); for SPR it carries the typed string.
      studentAnswer: a
        ? {
            selectedOptionId: !isSpr ? a.response_text : null,
            responseText: isSpr ? a.response_text : null,
            isCorrect: a.is_correct,
            submittedAt: a.created_at,
            timeSpentMs: a.time_spent_ms ?? null,
          }
        : null,
      // Re-attempt history. The first attempt is always the one
      // shown as `studentAnswer`; this list carries every later
      // attempt in chronological order so the report can label
      // them 2nd, 3rd, … with timestamps.
      additionalAttempts: (laterAttemptsByQid.get(qid) ?? []).map((la) => ({
        selectedOptionId: !isSpr ? la.response_text : null,
        responseText: isSpr ? la.response_text : null,
        isCorrect: la.is_correct,
        submittedAt: la.created_at,
        timeSpentMs: la.time_spent_ms ?? null,
      })),
      // Reveal payload — only surfaced when the student clicks
      // "Reveal answer". Sent eagerly because the session is
      // complete (the attempts row exists for every submitted
      // question); hiding it is UX, not a security gate.
      reveal: {
        correctOptionId: !isSpr ? extractMcqCorrectId(q.correct_answer) : null,
        correctAnswerDisplay: isSpr ? formatSprCorrect(q.correct_answer) : null,
        rationaleHtml: applyWatermark(
          q.rationale_rendered ?? q.rationale_html,
          targetUser.id,
        ),
      },
      status: a ? (a.is_correct ? 'correct' : 'incorrect') : 'unanswered',
      marked,
    };
  });

  // Per-question Desmos saved states for math items, attached to
  // items[].desmosSavedState so the client island can render the
  // saved-state button per selected question. One IN query for all
  // math questions in the session — the calls don't fan out per
  // navigation since the report is rendered in one shot.
  const mathQuestionIds = items
    .filter((it) => !it.missing && MATH_DOMAIN_CODES.has(it.taxonomy?.domain_code ?? ''))
    .map((it) => it.questionId);

  if (mathQuestionIds.length > 0) {
    const { data: savedStates } = await supabase
      .from('desmos_saved_states')
      .select('question_id, state_json')
      .in('question_id', mathQuestionIds)
      .eq('test_type', session.test_type ?? 'sat');
    const byQid = new Map(
      (savedStates ?? []).map((r) => [r.question_id, r.state_json]),
    );
    for (const it of items) {
      if (!it.missing && MATH_DOMAIN_CODES.has(it.taxonomy?.domain_code ?? '')) {
        it.desmosSavedState = byQid.get(it.questionId) ?? null;
      }
    }
  }

  // Concept tags — manager/admin only. One catalog query plus one
  // IN query for the per-question links; rather than per-item
  // round-trips on selection.
  const conceptTagsCanTag = CONCEPT_TAGS_CAN_TAG_ROLES.has(role);
  const conceptTagsCanDelete = role === 'admin';
  let conceptTagsCatalog = null;
  if (conceptTagsCanTag) {
    const presentQids = items.filter((it) => !it.missing).map((it) => it.questionId);
    // question_concept_tags rows are stored against v1 question
    // ids (the FK targets the legacy questions table). Pull the
    // v1 ↔ v2 mapping for the visible v2 ids and query against
    // the union, then key the result back to v2 ids when
    // assigning conceptTagIds to items.
    const v1ByV2 = await resolveLegacyQuestionIds(supabase, presentQids);
    const v2ByV1 = new Map();
    for (const [v2, v1] of v1ByV2) v2ByV1.set(v1, v2);
    const lookupQids = [
      ...presentQids,
      ...Array.from(v2ByV1.keys()),
    ];

    const [{ data: catalog }, { data: links }] = await Promise.all([
      supabase
        .from('concept_tags')
        .select('id, name')
        .order('name', { ascending: true }),
      lookupQids.length > 0
        ? supabase
            .from('question_concept_tags')
            .select('question_id, tag_id')
            .in('question_id', lookupQids)
        : Promise.resolve({ data: [] }),
    ]);
    conceptTagsCatalog = catalog ?? [];
    const tagsByQid = new Map();
    for (const r of links ?? []) {
      // Translate v1 question_id back to v2 so items.conceptTagIds
      // is keyed consistently with everything else on the page.
      const v2Qid = v2ByV1.get(r.question_id) ?? r.question_id;
      const arr = tagsByQid.get(v2Qid) ?? [];
      if (!arr.includes(r.tag_id)) arr.push(r.tag_id);
      tagsByQid.set(v2Qid, arr);
    }
    for (const it of items) {
      if (!it.missing) it.conceptTagIds = tagsByQid.get(it.questionId) ?? [];
    }
  }

  // Question notes — org-scoped tutor notes attached to each
  // item. Loader returns canView=false for non-tutor callers so
  // student review surfaces stay zero-cost.
  const presentQids = items.filter((it) => !it.missing).map((it) => it.questionId);
  const notesBundle = await loadQuestionNotesByQuestion({
    questionIds: presentQids,
    role,
    userId: user.id,
  });
  if (notesBundle.canView) {
    for (const it of items) {
      if (!it.missing) it.questionNotes = notesBundle.notesByQid.get(it.questionId) ?? [];
    }
  }

  // Student-private rich-text notes for the review surface's
  // popover. Always loaded — owner-only RLS scopes the read to the
  // calling user. The viewer is the owner here (review pages are
  // student-self surfaces; the tutor training-mode review is the
  // tutor's own training run, so they're equally the owner).
  const studentNotesByQid = await loadStudentNotesByQuestion(supabase, presentQids);
  for (const it of items) {
    if (!it.missing) {
      it.studentNote = studentNotesByQid.get(it.questionId) ?? null;
    }
  }

  // Error notes — same trust scope as student notes (RLS pinned to
  // the caller). Lets the ErrorLogButton in ReviewInteractive show
  // the existing entry without an extra round-trip per question.
  if (presentQids.length > 0) {
    const { data: errorNoteRows } = await supabase
      .from('question_error_notes')
      .select('question_id, body, updated_at')
      .eq('user_id', user.id)
      .in('question_id', presentQids)
      .eq('test_type', session.test_type ?? 'sat');
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
  const assignment = await buildAssignmentContext({
    supabase,
    target: targetUser,
    session,
    questionIds,
    attemptQuestionIds,
    assignmentRow,
    attemptsFloor,
  });

  return {
    sessionMeta: {
      sessionId: session.id,
      createdAt: session.created_at,
      mode: session.mode,
    },
    items,
    metrics,
    timing,
    assignment,
    desmosCanSave: DESMOS_CAN_SAVE_ROLES.has(role),
    conceptTagsCatalog,
    conceptTagsCanTag,
    conceptTagsCanDelete,
    questionNotesCanView: notesBundle.canView,
    questionNotesIsAdmin: notesBundle.isAdmin,
    currentUserId: user.id,
  };
}

// ──────────────────────────────────────────────────────────────
// Metrics. Overall + by-score-band + by-domain (with per-skill
// breakdowns inside each domain). Computed once here and handed
// to the client island in its final shape.
// ──────────────────────────────────────────────────────────────

function buildMetrics(items) {
  let total = 0;
  let attempted = 0;
  let correct = 0;
  const byScoreBand = new Map();      // band → {correct, total}
  const byDomain = new Map();         // domain_name → {correct, total, skills: Map}

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

// ──────────────────────────────────────────────────────────────
// Timing. Per-position time_spent_ms, plus total + median, used
// by the timing band and its tooltip.
// ──────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────
// Assignment context. When a session was started from an
// assignment, load the assignment row plus every attempt the
// student has on any of the assignment's question ids, so the
// report can show the assignment title + a daily practice
// heatmap. Falls back to "no assignment context" on any failure.
// ──────────────────────────────────────────────────────────────

async function buildAssignmentContext({ supabase, target, session, questionIds, attemptQuestionIds = null, assignmentRow = null, attemptsFloor = null }) {
  const assignmentId =
    session.filter_criteria
    && typeof session.filter_criteria === 'object'
    && typeof session.filter_criteria.assignment_id === 'string'
      ? session.filter_criteria.assignment_id
      : null;

  if (!assignmentId) return null;

  // The caller may have already loaded the assignment row to
  // compute the attempts time-floor; reuse it to avoid a second
  // round trip. Fall back to fetching here when not provided.
  let assignment = assignmentRow;
  if (!assignment) {
    const { data } = await supabase
      .from('assignments_v2')
      .select('id, title, description, assignment_type, question_ids, due_date, created_at')
      .eq('id', assignmentId)
      .maybeSingle();
    assignment = data ?? null;
  }
  if (!assignment) return null;

  // Cover both eras: a legacy assignment carries v1 ids on
  // questionIds but post-cutover attempts use v2 ids (and vice
  // versa). The caller already widened the set; fall back to
  // questionIds when not provided.
  const dailyAttemptIds = Array.isArray(attemptQuestionIds) && attemptQuestionIds.length > 0
    ? attemptQuestionIds
    : questionIds;
  // Floor matches the items[] attempts query above so the daily map
  // and the per-question grid count the same attempts. Without it,
  // a student's pre-assignment history on the same qids bled into
  // the daily chart and made the totals diverge from the question
  // map. Fall back to the assignment's own created_at when the
  // caller didn't compute a floor.
  const floor = attemptsFloor ?? assignment.created_at ?? null;
  let attemptsQuery = supabase
    .from('attempts')
    .select('question_id, created_at, is_correct, time_spent_ms')
    .eq('user_id', target.id)
    .in('question_id', dailyAttemptIds)
    .order('created_at', { ascending: true });
  if (floor) attemptsQuery = attemptsQuery.gte('created_at', floor);
  const { data: assignmentAttempts } = await attemptsQuery;

  // Chart spans from the assignment's issue date through today, per
  // the description text — not from the earliest attempt. Without
  // this override the chart silently truncated to whichever day the
  // student first practiced, which hid the "didn't start until day
  // N" pattern a tutor would want to spot.
  const firstDayOverride = assignment.created_at
    ? assignment.created_at.slice(0, 10)
    : null;
  const dailyMap = buildDailyMap(assignmentAttempts ?? [], { firstDayOverride });
  return {
    id: assignment.id,
    title: assignment.title ?? 'Assignment',
    description: assignment.description ?? null,
    dueDate: assignment.due_date ?? null,
    totalQuestions: Array.isArray(assignment.question_ids)
      ? assignment.question_ids.length
      : questionIds.length,
    dailyMap,
  };
}

// ──────────────────────────────────────────────────────────────
// Daily practice map. Groups an assignment's attempts by
// local-calendar day so the review page can render a Duolingo-
// style streak strip. Rendered in UTC dates (good enough for a
// visual — per-student timezone would require the browser, but
// this is a server view and consistency-across-reloads wins).
// ──────────────────────────────────────────────────────────────

function buildDailyMap(attempts, { firstDayOverride = null } = {}) {
  if (!attempts.length && !firstDayOverride) {
    return { days: [], firstDay: null, lastDay: null, totalAttempts: 0 };
  }
  const byDay = new Map();  // 'YYYY-MM-DD' → {attempts, correct, timeMs}
  for (const a of attempts) {
    const iso = (a.created_at || '').slice(0, 10);
    if (!iso) continue;
    const entry = byDay.get(iso) ?? { attempts: 0, correct: 0, timeMs: 0 };
    entry.attempts += 1;
    if (a.is_correct) entry.correct += 1;
    if (typeof a.time_spent_ms === 'number' && a.time_spent_ms > 0) {
      entry.timeMs += a.time_spent_ms;
    }
    byDay.set(iso, entry);
  }
  // Fill the calendar from first-day through today so empty days
  // show up as gaps in the strip (the UX the user asked for:
  // "how the assignment questions were distributed over time").
  // firstDayOverride (when supplied) anchors the chart to the
  // assignment's issue date so a tutor sees the full span even
  // when the student didn't start practicing until later.
  const firstAttemptIso = [...byDay.keys()].sort()[0] ?? null;
  const firstIso = firstDayOverride
    && (!firstAttemptIso || firstDayOverride <= firstAttemptIso)
      ? firstDayOverride
      : firstAttemptIso;
  const lastIso = new Date().toISOString().slice(0, 10);
  const days = [];
  const cursor = new Date(`${firstIso}T00:00:00Z`);
  const end = new Date(`${lastIso}T00:00:00Z`);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const entry = byDay.get(iso) ?? { attempts: 0, correct: 0, timeMs: 0 };
    days.push({ date: iso, ...entry });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return {
    days,
    firstDay: firstIso,
    lastDay: lastIso,
    totalAttempts: attempts.length,
  };
}
