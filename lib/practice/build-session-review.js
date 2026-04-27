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
import { inferLayoutMode } from '@/lib/ui/question-layout';

const MATH_DOMAIN_CODES = new Set(['H', 'P', 'Q', 'S']);
const DESMOS_CAN_SAVE_ROLES = new Set(['manager', 'admin']);
const CONCEPT_TAGS_CAN_TAG_ROLES = new Set(['manager', 'admin']);

/**
 * Build the full view-model handed to <ReviewInteractive />.
 *
 * @param {object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.supabase
 * @param {{ id: string }} args.user
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
export async function buildSessionReview({ supabase, user, role = null, session }) {
  const questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];

  // 1) All questions and all attempts in parallel. One IN query
  //    each — we need full content + rationale + correct_answer
  //    for every question because the client island switches
  //    between them without further fetches.
  const [{ data: questions }, { data: attempts }] = await Promise.all([
    supabase
      .from('questions_v2')
      .select(
        'id, question_type, stimulus_html, stem_html, options, stimulus_rendered, stem_rendered, options_rendered, rationale_html, rationale_rendered, correct_answer, domain_code, domain_name, skill_name, difficulty, score_band, display_code',
      )
      .in('id', questionIds),
    // Attempts against these questions, scoped to after the session
    // started so attempts from earlier sessions on the same questions
    // don't bleed into this session's report. Attempts don't carry a
    // session_id column, so the timestamp is the binding.
    supabase
      .from('attempts')
      .select('question_id, is_correct, selected_option_id, response_text, created_at, time_spent_ms')
      .eq('user_id', user.id)
      .in('question_id', questionIds)
      .gte('created_at', session.created_at)
      .order('created_at', { ascending: true }),
  ]);

  const questionsById = new Map((questions ?? []).map((q) => [q.id, q]));

  // First attempt wins — that's the "initial answer" the student
  // gave during the session, which is what the report shows.
  const firstAttemptByQid = new Map();
  for (const a of attempts ?? []) {
    if (!firstAttemptByQid.has(a.question_id)) {
      firstAttemptByQid.set(a.question_id, a);
    }
  }

  const items = questionIds.map((qid, position) => {
    const q = questionsById.get(qid);
    const a = firstAttemptByQid.get(qid) ?? null;

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
      };
    }

    const isSpr = q.question_type === 'spr';

    const stimulusHtml = applyWatermark(
      q.stimulus_rendered ?? q.stimulus_html,
      user.id,
    );
    const stemHtml = applyWatermark(
      q.stem_rendered ?? q.stem_html,
      user.id,
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
        content_html: applyWatermark(content, user.id),
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
      // Reveal payload — only surfaced when the student clicks
      // "Reveal answer". Sent eagerly because the session is
      // complete (the attempts row exists for every submitted
      // question); hiding it is UX, not a security gate.
      reveal: {
        correctOptionId: !isSpr ? extractMcqCorrectId(q.correct_answer) : null,
        correctAnswerDisplay: isSpr ? formatSprCorrect(q.correct_answer) : null,
        rationaleHtml: applyWatermark(
          q.rationale_rendered ?? q.rationale_html,
          user.id,
        ),
      },
      status: a ? (a.is_correct ? 'correct' : 'incorrect') : 'unanswered',
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
      .in('question_id', mathQuestionIds);
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

  const metrics = buildMetrics(items);
  const timing = buildTiming(items);
  const assignment = await buildAssignmentContext({
    supabase,
    user,
    session,
    questionIds,
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
// Metrics. Overall + by-difficulty + by-domain (with per-skill
// breakdowns inside each domain). Computed once here and handed
// to the client island in its final shape.
// ──────────────────────────────────────────────────────────────

function buildMetrics(items) {
  let total = 0;
  let attempted = 0;
  let correct = 0;
  const byDifficulty = new Map();     // diff → {correct, total}
  const byDomain = new Map();         // domain_name → {correct, total, skills: Map}

  for (const it of items) {
    total += 1;
    if (it.missing) continue;
    const hasAttempt = it.studentAnswer != null;
    if (hasAttempt) {
      attempted += 1;
      if (it.studentAnswer.isCorrect) correct += 1;
    }

    const diff = it.taxonomy?.difficulty ?? 0;
    const diffEntry = byDifficulty.get(diff) ?? { correct: 0, total: 0 };
    diffEntry.total += 1;
    if (hasAttempt && it.studentAnswer.isCorrect) diffEntry.correct += 1;
    byDifficulty.set(diff, diffEntry);

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
    byDifficulty: Array.from(byDifficulty.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([difficulty, v]) => ({ difficulty, ...v })),
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

async function buildAssignmentContext({ supabase, user, session, questionIds }) {
  const assignmentId =
    session.filter_criteria
    && typeof session.filter_criteria === 'object'
    && typeof session.filter_criteria.assignment_id === 'string'
      ? session.filter_criteria.assignment_id
      : null;

  if (!assignmentId) return null;

  const [{ data: assignment }, { data: assignmentAttempts }] = await Promise.all([
    supabase
      .from('assignments_v2')
      .select('id, title, description, assignment_type, question_ids, due_date, created_at')
      .eq('id', assignmentId)
      .maybeSingle(),
    // All attempts this student has on ANY question in the
    // assignment — across every session, not just this one.
    // Powers the daily practice map.
    supabase
      .from('attempts')
      .select('question_id, created_at, is_correct, time_spent_ms')
      .eq('user_id', user.id)
      .in(
        'question_id',
        // Fall back to the session's ids if the assignment row
        // couldn't be loaded — RLS may have filtered it out.
        questionIds,
      )
      .order('created_at', { ascending: true }),
  ]);

  if (!assignment) return null;

  const dailyMap = buildDailyMap(assignmentAttempts ?? []);
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

function buildDailyMap(attempts) {
  if (!attempts.length) {
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
  const firstIso = [...byDay.keys()].sort()[0];
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
