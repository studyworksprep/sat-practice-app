// Practice session start page.
//
// Server-side: load the filter taxonomy for whichever test type the
// student selected, then hand control to the matching client island
// (StartInteractive for SAT, StartInteractiveAct for ACT).
//
// Test-type slice. SAT-first tabs per docs/architecture-plan.md §3.4:
// the page accepts a `?test=sat|act` query param and dispatches at
// the page layer. There is no stored preference — the URL is the
// single source of truth. A student switching from SAT to ACT pays
// one click; the runner itself is unified (PR 5).
//
// The practice page downstream of this one never sees filters —
// it reads question_ids[position] from the practice_sessions row
// and renders. That separation is the whole point of the
// fixed-list redesign: dumb viewer, smart generator.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import {
  createSession, countAvailable,
  createActSession, countAvailableAct,
} from './actions';
import { searchQuestions } from '@/lib/practice/question-search-actions';
import { StartInteractive } from '@/lib/practice/StartInteractive';
import { StartInteractiveAct } from '@/lib/practice/StartInteractiveAct';
import { domainSection } from '@/lib/ui/question-layout';
import { ACT_SECTIONS, sectionLabel } from '@/lib/practice/act-taxonomy';
import { fetchAll } from '@/lib/supabase/fetchAll';
// fetchAll is still used by the ACT launcher below; the SAT side
// reads the pre-aggregated public.published_question_taxonomy view
// instead.
import s from './PracticeStart.module.css';

export const dynamic = 'force-dynamic';

export default async function PracticeStartPage({ searchParams }) {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // ?test=sat|act slice. Anything else (missing, malformed) lands on
  // SAT — the SAT-first principle from §3.4. We don't redirect on a
  // bad value because tab navigation is the canonical way to switch.
  const sp = (await searchParams) ?? {};
  const testParam = typeof sp.test === 'string' ? sp.test.toLowerCase() : '';
  const testType = testParam === 'act' ? 'act' : 'sat';

  if (testType === 'act') {
    return <ActLauncher user={user} supabase={supabase} />;
  }
  return <SatLauncher user={user} supabase={supabase} />;
}

// ──────────────────────────────────────────────────────────────
// SAT launcher — existing behavior, factored into a helper so the
// page-level test-type branch stays one switch.
// ──────────────────────────────────────────────────────────────

async function SatLauncher({ user, supabase }) {
  // Domain / skill lookup. v2 has taxonomy inline on questions_v2,
  // and public.published_question_taxonomy rolls that up to one row
  // per skill so the launcher reads ~30 rows in one round-trip
  // instead of paging through every published question (see
  // docs/architecture-plan.md Finding #1 and the New Assignment
  // loader for the same pattern). question_count is per-skill;
  // domain totals are derived client-side as their sum.
  const { data: taxonomyRows } = await supabase
    .from('published_question_taxonomy')
    .select('domain_name, skill_name, question_count, score_bands, domain_code');

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

  // Parallel loads for the rest of the page:
  //   - active practice session (Resume card)
  //   - in-progress test attempt (Resume-test card). Test launch UX
  //     lives on its own page now (/practice/tests); this page only
  //     surfaces the resume callout so a student mid-test doesn't
  //     miss it.
  const [
    { data: activeSession },
    { data: inProgressTestAttempt },
  ] = await Promise.all([
    // SAT practice launcher Resume card.
    supabase
      .from('practice_sessions')
      .select('id, current_position, question_ids, last_activity_at')
      .eq('user_id', user.id)
      .eq('mode', 'practice')
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
  ]);

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

  return (
    <>
      <TestTypeTabs current="sat" />
      <StartInteractive
        domains={domains}
        scoreBands={scoreBands}
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
  // Pull every non-broken ACT question's section + category so the
  // launcher can render counts per (section, category). Volume is
  // small (~231 today) — one paginated query is overkill but matches
  // the SAT loader's shape and stays safe as the bank grows.
  const actRows = await fetchAll((from, to) =>
    supabase
      .from('act_questions')
      .select('section, category, subcategory')
      .eq('is_broken', false)
      .range(from, to),
  );

  // Bucket per (section, category, subcategory). The canonical
  // section order (ACT_SECTIONS) ensures English → Math → Reading
  // → Science even when only some sections have data.
  const sectionAcc = new Map();
  for (const row of actRows) {
    if (!row.section) continue;
    let sec = sectionAcc.get(row.section);
    if (!sec) {
      sec = { count: 0, categories: new Map() };
      sectionAcc.set(row.section, sec);
    }
    sec.count += 1;
    if (row.category) {
      let cat = sec.categories.get(row.category);
      if (!cat) {
        cat = { count: 0, subcategories: new Map() };
        sec.categories.set(row.category, cat);
      }
      cat.count += 1;
      if (row.subcategory) {
        cat.subcategories.set(
          row.subcategory,
          (cat.subcategories.get(row.subcategory) ?? 0) + 1,
        );
      }
    }
  }

  const sections = ACT_SECTIONS
    .filter((sec) => sectionAcc.has(sec))
    .map((sec) => {
      const entry = sectionAcc.get(sec);
      return {
        section: sec,
        name: sectionLabel(sec),
        count: entry.count,
        // Categories sorted by count desc — biggest bucket first so
        // the student sees the most-likely picks at the top of the
        // expanded list. Subcategories within each category get the
        // same treatment; categories with no labeled subcategories
        // (Reading, Science, Math IES) just send an empty array.
        categories: Array.from(entry.categories.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .map(([name, cat]) => ({
            name,
            count: cat.count,
            subcategories: Array.from(cat.subcategories.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([subName, subCount]) => ({ name: subName, count: subCount })),
          })),
      };
    });

  // Active ACT session for the Resume card.
  const { data: activeActSession } = await supabase
    .from('practice_sessions')
    .select('id, current_position, question_ids, last_activity_at')
    .eq('user_id', user.id)
    .eq('mode', 'practice')
    .eq('status', 'in_progress')
    .eq('test_type', 'act')
    .gt('expires_at', new Date().toISOString())
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle();

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
      <TestTypeTabs current="act" />
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

// ──────────────────────────────────────────────────────────────
// Tabs. SAT first, ACT second — §3.4 ("SAT-first tabs, no
// preferred_test_type column"). Plain server-rendered links so
// switching tabs is just a navigation, no client state.
// ──────────────────────────────────────────────────────────────

function TestTypeTabs({ current }) {
  return (
    <nav className={s.tabs} aria-label="Test type">
      <Link
        href="/practice/start"
        className={`${s.tab} ${current === 'sat' ? s.tabActive : ''}`}
        aria-current={current === 'sat' ? 'page' : undefined}
      >
        SAT
      </Link>
      <Link
        href="/practice/start?test=act"
        className={`${s.tab} ${current === 'act' ? s.tabActive : ''}`}
        aria-current={current === 'act' ? 'page' : undefined}
      >
        ACT
      </Link>
    </nav>
  );
}
