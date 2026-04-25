// Session review page — post-session performance report plus
// per-question review.
//
// URL: /practice/review/[sessionId]
//
// Loaded on session complete (from the practice runner's handleNext
// on the last question) and from the practice-history list. The
// whole session is pre-rendered into a single view model — all
// questions, the student's initial answer per question, and the
// correct-answer + rationale for each — so the client island can
// switch questions without any further network round-trip. That's
// consistent with the architecture-plan §3.7 principle (no
// useEffect + fetch; server-render everything the client needs).
//
// The correct answer and rationale are loaded here because the
// student has already submitted every one — the content-protection
// gate (attempts row must exist) has already been cleared. We
// watermark both before handing them to the client, matching the
// submitAnswer Server Action's behavior.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { applyWatermark } from '@/lib/content/watermark';
import { extractMcqCorrectId, formatSprCorrect } from '@/lib/practice/correct-answer';
import { inferLayoutMode } from '@/lib/ui/question-layout';
import { ReviewInteractive } from '@/lib/practice/ReviewInteractive';

export const dynamic = 'force-dynamic';

export default async function PracticeReviewPage({ params }) {
  const { sessionId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // 1) Session row. RLS pins this to the owning user; a stray
  //    session id belonging to someone else just 404s.
  const { data: session } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, created_at, mode, filter_criteria')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) notFound();
  if (session.user_id !== user.id) notFound();

  const questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];
  if (questionIds.length === 0) notFound();

  // 2) All questions and all attempts in parallel. One IN query
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
  // gave during the session, which is what the report shows. Any
  // follow-up attempts (e.g. from a Review re-run on the same qid)
  // are irrelevant for the session's own report.
  const firstAttemptByQid = new Map();
  for (const a of attempts ?? []) {
    if (!firstAttemptByQid.has(a.question_id)) {
      firstAttemptByQid.set(a.question_id, a);
    }
  }

  // 3) Build the per-position view-model array. Each entry is
  //    everything the client island needs to render that question
  //    in review mode: stems + options + the student's answer +
  //    the reveal payload (correct answer + rationale).
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

  // 4) Session-level metrics. Computed in the Server Component so
  //    the client gets something flat + pre-aggregated.
  const metrics = buildMetrics(items);

  // 5) Timing view-model — one entry per position that carries
  //    enough for the client's timing band (tooltip on hover).
  //    Items without an attempt have timeSpentMs=0 and render
  //    neutrally in the band.
  const timing = buildTiming(items);

  // 6) If this session was started from an assignment, load the
  //    assignment row plus every attempt the student has on any
  //    of the assignment's question ids, so the report can show
  //    the assignment context + a daily practice heatmap. Any
  //    failure here falls back to "no assignment context".
  let assignmentContext = null;
  const assignmentId =
    session.filter_criteria
    && typeof session.filter_criteria === 'object'
    && typeof session.filter_criteria.assignment_id === 'string'
      ? session.filter_criteria.assignment_id
      : null;

  if (assignmentId) {
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

    if (assignment) {
      const dailyMap = buildDailyMap(assignmentAttempts ?? []);
      assignmentContext = {
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
  }

  const sessionMeta = {
    sessionId: session.id,
    createdAt: session.created_at,
    mode: session.mode,
  };

  return (
    <ReviewInteractive
      sessionMeta={sessionMeta}
      items={items}
      metrics={metrics}
      timing={timing}
      assignment={assignmentContext}
    />
  );
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
