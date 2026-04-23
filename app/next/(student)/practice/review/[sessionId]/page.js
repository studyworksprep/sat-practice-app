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
import { ReviewInteractive } from './ReviewInteractive';

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
      .select('question_id, is_correct, selected_option_id, response_text, created_at')
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
