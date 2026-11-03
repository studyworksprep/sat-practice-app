import { resolveTestType } from '@/lib/practice/test-type-server';
// Practice session start page.
//
// Server-side: load the filter taxonomy for whichever test type the
// student selected, then hand control to the matching client island
// (StartInteractive for SAT, StartInteractiveAct for ACT).
//
// Test-type slice: an explicit `?test=sat|act` dispatches at the page
// layer; without one, the sidebar SAT/ACT switch's stored choice does
// (lib/practice/test-type-server.ts — a cookie, not a profile column;
// see docs/upgrade-plan-2026-07.md §6.1). The runner itself is
// unified (PR 5).
//
// The practice page downstream of this one never sees filters —
// it reads question_ids[position] from the practice_sessions row
// and renders. That separation is the whole point of the
// fixed-list redesign: dumb viewer, smart generator.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import {
  createSession, countAvailable,
  createActSession, countAvailableAct,
} from './actions';
import { loadActPracticeTaxonomy } from '@/lib/practice/act-practice-taxonomy';
import { searchQuestions } from '@/lib/practice/question-search-actions';
import { StartInteractive } from '@/lib/practice/StartInteractive';
import { loadDashboardAggregate } from '@/lib/practice/load-dashboard-aggregate';
import { buildPracticeSuggestions } from '@/lib/practice/practice-suggestions';
import { StartInteractiveAct } from '@/lib/practice/StartInteractiveAct';
import { domainSection } from '@/lib/ui/question-layout';

export const dynamic = 'force-dynamic';

export default async function PracticeStartPage({ searchParams }) {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // A malformed ?test= falls through to the stored choice, then SAT;
  // no redirect — the sidebar switch is the canonical way to switch.
  const sp = (await searchParams) ?? {};
  // ?test= wins; otherwise the sidebar SAT/ACT switch's stored choice.
  const testType = await resolveTestType(sp.test);

  if (testType === 'act') {
    return <ActLauncher user={user} supabase={supabase} />;
  }
  // ?skill= (repeatable) prefills the builder — the Performance page's
  // Drill links. The builder drops names it doesn't know.
  const initialSkills = [].concat(sp.skill ?? []).filter((v) => typeof v === 'string');
  return <SatLauncher user={user} supabase={supabase} initialSkills={initialSkills} />;
}

// ──────────────────────────────────────────────────────────────
// SAT launcher — existing behavior, factored into a helper so the
// page-level test-type branch stays one switch.
// ──────────────────────────────────────────────────────────────

async function SatLauncher({ user, supabase, initialSkills }) {
  // Domain / skill lookup. v2 has taxonomy inline on questions_v2,
  // and public.published_question_taxonomy rolls that up to one row
  // per skill so the launcher reads ~30 rows in one round-trip
  // instead of paging through every published question (see
  // docs/architecture-plan.md Finding #1 and the New Assignment
  // loader for the same pattern). question_count is per-skill;
  // domain totals are derived client-side as their sum.
  // Parallel loads for the rest of the page:
  //   - active practice session (Resume card)
  //   - in-progress test attempt (Resume-test card). Test launch UX
  //     lives on its own page now (/practice/tests); this page only
  //     surfaces the resume callout so a student mid-test doesn't
  //     miss it.
  const [
    { data: taxonomyRows },
    { data: activeSession },
    { data: inProgressTestAttempt },
    { data: extraBatchRows },
    skillStats,
  ] = await Promise.all([
    supabase.from('published_question_taxonomy')
      .select('domain_name, skill_name, question_count, score_bands, domain_code'),
    // SAT practice launcher Resume card.
    supabase
      .from('practice_sessions')
      .select('id, current_position, question_ids, last_activity_at')
      .eq('user_id', user.id)
      .in('mode', ['practice', 'review'])
      .eq('status', 'in_progress')
      .eq('test_type', 'sat')
      .gt('expires_at', new Date().toISOString())
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('practice_test_attempts_v2')
      .select('id, practice_test_id, started_at, practice_test:practice_tests_v2(name, code)')
      .eq('user_id', user.id)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Opt-in import batches with at least one live question — the
    // "Extra practice sets" section. The rest of the filter card
    // (taxonomy counts above) covers the standard pool only; these
    // sets join the candidate pool per-session when selected.
    supabase
      .from('published_question_batches')
      .select('id, label, administration_date, question_count')
      .order('administration_date', { ascending: false, nullsFirst: false }),
    // Per-skill 90-day stats for "Suggested for you" — the same rollup
    // the dashboard reads. Suggestions are optional: a failed read just
    // means the row doesn't render.
    loadDashboardAggregate(user.id)
      .then((agg) => [...agg.performance.math.domains, ...agg.performance.rw.domains]
        .flatMap((d) => d.skills)
        .map((sk) => ({ name: sk.name, correct: sk.correct, total: sk.total })))
      .catch(() => []),
  ]);

  const domainMap = new Map();
  const scoreBandSet = new Set();
  for (const row of taxonomyRows ?? []) {
    let entry = domainMap.get(row.domain_name);
    if (!entry) {
      entry = {
        code: row.domain_code ?? null,
        skills: new Map(),
        total: 0,
      };
      domainMap.set(row.domain_name, entry);
    }
    entry.total += row.question_count ?? 0;
    entry.skills.set(row.skill_name, row.question_count ?? 0);
    for (const sb of row.score_bands ?? []) scoreBandSet.add(sb);
  }
  const domains = Array.from(domainMap.entries())
    .map(([name, e]) => ({
      name,
      code: e.code,
      section: domainSection(e.code),
      skills: Array.from(e.skills.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([skillName, count]) => ({ name: skillName, count })),
      total: e.total,
    }))
    .sort((a, b) => {
      // Math section first, then alphabetical within each section.
      if (a.section !== b.section) return a.section === 'math' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  const scoreBands = Array.from(scoreBandSet).sort((a, b) => a - b);

  const resumeInfo = activeSession
    ? {
        sessionId: activeSession.id,
        position:  activeSession.current_position,
        total:     Array.isArray(activeSession.question_ids)
          ? activeSession.question_ids.length
          : 0,
        lastActivityAt: activeSession.last_activity_at,
      }
    : null;

  const resumeTest = inProgressTestAttempt
    ? {
        attemptId: inProgressTestAttempt.id,
        testId:    inProgressTestAttempt.practice_test_id,
        testName:  inProgressTestAttempt.practice_test?.name ?? 'Practice test',
        startedAt: inProgressTestAttempt.started_at,
      }
    : null;

  const extraBatches = (extraBatchRows ?? []).map((b) => ({
    id: b.id,
    label: b.label,
    count: b.question_count ?? 0,
  }));

  return (
    <>
      <StartInteractive
        domains={domains}
        scoreBands={scoreBands}
        extraBatches={extraBatches}
        suggestions={buildPracticeSuggestions(domains, skillStats)}
        initialSkills={initialSkills}
        resumeInfo={resumeInfo}
        resumeTest={resumeTest}
        createSessionAction={createSession}
        countAvailableAction={countAvailable}
        searchQuestionsAction={searchQuestions}
        basePath="/practice"
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// ACT launcher — sibling to SatLauncher. Reads act_questions
// taxonomy + ACT in-progress session, hands data to
// StartInteractiveAct.
// ──────────────────────────────────────────────────────────────

async function ActLauncher({ user, supabase }) {
  // Read compact counts and the independent Resume card together.
  const [sections, { data: activeActSession }] = await Promise.all([
    loadActPracticeTaxonomy(supabase),
    supabase
      .from('practice_sessions')
      .select('id, current_position, question_ids, last_activity_at')
      .eq('user_id', user.id)
      .in('mode', ['practice', 'review'])
      .eq('status', 'in_progress')
      .eq('test_type', 'act')
      .gt('expires_at', new Date().toISOString())
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const resumeInfo = activeActSession
    ? {
        sessionId: activeActSession.id,
        position:  activeActSession.current_position,
        total:     Array.isArray(activeActSession.question_ids)
          ? activeActSession.question_ids.length
          : 0,
        lastActivityAt: activeActSession.last_activity_at,
      }
    : null;

  return (
    <>
      <StartInteractiveAct
        sections={sections}
        resumeInfo={resumeInfo}
        createSessionAction={createActSession}
        countAvailableAction={countAvailableAct}
        basePath="/practice"
      />
    </>
  );
}

