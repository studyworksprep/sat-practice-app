import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/server';
import LaunchPanel from './LaunchPanel';
import AbandonButton from './AbandonButton';
import DeleteResultButton from './DeleteResultButton';
import PracticeTestClient from './PracticeTestClient';

function fmt(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ScoreBadge({ score, label }) {
  return (
    <div className="ptScoreBadge">
      <span className="ptScoreNum">{score ?? '—'}</span>
      <span className="ptScoreLabel">{label}</span>
    </div>
  );
}

const SUBJECT_LABELS = { rw: 'R&W', RW: 'R&W', math: 'Math', m: 'Math', M: 'Math' };

export default async function PracticeTestListPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // Practice-only users cannot access practice tests
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if ((profile?.role || 'practice') === 'practice') redirect('/practice');

  const isTeacher = profile?.role === 'teacher' || profile?.role === 'manager' || profile?.role === 'admin';
  const { tests, attempts } = await fetchData(supabase, user.id);

  const inProgress = attempts.filter((a) => a.status === 'in_progress');
  const completed = attempts.filter((a) => a.status === 'completed');

  // Map test id → name for the history rows
  const testNameById = Object.fromEntries(tests.map((t) => [t.id, t.name]));

  const trainingContent = (
    <>
      <h1 className="h1" style={{ marginBottom: 4 }}>Practice Tests</h1>
      <p className="muted small" style={{ marginBottom: 28 }}>
        Full-length, adaptive SAT practice tests with timed modules.
      </p>

      {/* ── Launch panel ─────────────────────────────────────── */}
      {tests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px', marginBottom: 24 }}>
          <p className="muted">No practice tests are available yet.</p>
        </div>
      ) : (
        <LaunchPanel tests={tests} />
      )}

      {/* ── In-progress ──────────────────────────────────────── */}
      {inProgress.length > 0 && (
        <section className="ptLandingSection">
          <div className="ptLandingSectionLabel">In Progress</div>
          {inProgress.map((a) => (
            <div key={a.id} className="card ptInProgressCard">
              <div className="ptInProgressInfo">
                <div className="ptInProgressName">{testNameById[a.practice_test_id] ?? 'Practice Test'}</div>
                <div className="muted small">Started {fmt(a.started_at)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Link href={`/practice-test/attempt/${a.id}`} className="btn">
                  Resume →
                </Link>
                <AbandonButton attemptId={a.id} />
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Completed ────────────────────────────────────────── */}
      {completed.length > 0 && (
        <section className="ptLandingSection">
          <div className="ptLandingSectionLabel">Completed Tests</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {completed.map((a, i) => (
              <div key={a.id} className={`ptHistoryRow${i < completed.length - 1 ? ' ptHistoryRowBorder' : ''}`}>
                <div className="ptHistoryLeft">
                  <div className="ptHistoryName">
                    {testNameById[a.practice_test_id] ?? 'Practice Test'}
                    {a.sectionsMode && <span className="pill" style={{ fontSize: 10, padding: '1px 6px', marginLeft: 6, background: '#e0e7ff', color: '#3730a3' }}>{a.sectionsMode === 'rw' ? 'R&W Only' : 'Math Only'}</span>}
                  </div>
                  <div className="muted small">{fmt(a.finished_at || a.started_at)}</div>
                </div>
                <div className="ptHistoryScores">
                  {a.composite != null && <ScoreBadge score={a.composite} label="Total" />}
                  {Object.entries(a.sectionScores || {}).map(([subj, s]) => (
                    <ScoreBadge key={subj} score={s.scaled} label={SUBJECT_LABELS[subj] || subj} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Link href={`/practice-test/attempt/${a.id}/results`} className="btn secondary ptHistoryBtn">
                    Review
                  </Link>
                  <DeleteResultButton attemptId={a.id} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );

  return <PracticeTestClient trainingContent={trainingContent} isTeacher={isTeacher} />;
}

// Direct Supabase query to avoid self-referential fetch in server component
async function fetchData(supabase, userId) {
  const { computeScaledScore } = await import('../../lib/scoreConversion');

  const subjToSection = {
    RW: 'reading_writing', rw: 'reading_writing',
    M: 'math', m: 'math', math: 'math', Math: 'math', MATH: 'math',
  };

  const [{ data: testsRaw }, { data: modulesRaw }, { data: moduleItemsRaw }] = await Promise.all([
    supabase.from('practice_tests').select('id, code, name, is_adaptive, created_at').eq('is_published', true).order('created_at', { ascending: true }),
    supabase.from('practice_test_modules').select('id, practice_test_id, subject_code, module_number, route_code, time_limit_seconds'),
    supabase.from('practice_test_module_items').select('practice_test_module_id'),
  ]);

  const itemsByModule = {};
  for (const item of moduleItemsRaw || []) {
    itemsByModule[item.practice_test_module_id] = (itemsByModule[item.practice_test_module_id] || 0) + 1;
  }

  const modulesByTest = {};
  const modById = {};
  for (const mod of modulesRaw || []) {
    modById[mod.id] = mod;
    if (!modulesByTest[mod.practice_test_id]) modulesByTest[mod.practice_test_id] = [];
    modulesByTest[mod.practice_test_id].push({ ...mod, question_count: itemsByModule[mod.id] || 0 });
  }

  const tests = (testsRaw || []).map((t) => {
    const mods = modulesByTest[t.id] || [];
    const subjects = [...new Set(mods.map((m) => m.subject_code))];
    return { ...t, subjects, modules: mods };
  }).sort((a, b) => {
    const numA = parseInt((a.name || '').match(/(\d+)/)?.[1], 10) || 0;
    const numB = parseInt((b.name || '').match(/(\d+)/)?.[1], 10) || 0;
    return numA - numB;
  });

  const { data: attemptsRaw } = await supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, status, metadata, started_at, finished_at, composite_score, rw_scaled, math_scaled')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });

  const completedAttempts = (attemptsRaw || []).filter((a) => a.status === 'completed');
  const completedIds = completedAttempts.map((a) => a.id);
  let moduleAttemptsByPta = {};
  let lookupByTestSection = {};

  if (completedIds.length > 0) {
    const { data: moduleAttempts } = await supabase
      .from('practice_test_module_attempts')
      .select('practice_test_attempt_id, practice_test_module_id, correct_count')
      .in('practice_test_attempt_id', completedIds);

    for (const ma of moduleAttempts || []) {
      const mod = modById[ma.practice_test_module_id];
      if (!mod) continue;
      if (!moduleAttemptsByPta[ma.practice_test_attempt_id]) moduleAttemptsByPta[ma.practice_test_attempt_id] = {};
      const key = `${mod.subject_code}/${mod.module_number}`;
      moduleAttemptsByPta[ma.practice_test_attempt_id][key] = {
        correct: ma.correct_count || 0,
        routeCode: mod.route_code,
        subjectCode: mod.subject_code,
      };
    }

    const testIds = [...new Set(completedAttempts.map((a) => a.practice_test_id))];
    const { data: lookupRows } = await supabase
      .from('score_conversion')
      .select('test_id, section, module1_correct, module2_correct, scaled_score')
      .in('test_id', testIds);

    for (const row of lookupRows || []) {
      const key = `${row.test_id}/${row.section}`;
      if (!lookupByTestSection[key]) lookupByTestSection[key] = [];
      lookupByTestSection[key].push(row);
    }
  }

  const attempts = (attemptsRaw || []).map((a) => {
    // Prefer cached scores (written by the results page) for consistency
    const hasCached = a.composite_score != null && (a.rw_scaled != null || a.math_scaled != null);

    const modData = moduleAttemptsByPta[a.id] || {};
    const subjects = [...new Set(Object.values(modData).map((d) => d.subjectCode))];
    const sectionScores = {};
    let composite = null;

    for (const subj of subjects) {
      const m1 = modData[`${subj}/1`] || { correct: 0 };
      const m2 = modData[`${subj}/2`] || { correct: 0, routeCode: null };
      const sectionName = subjToSection[subj] || 'math';

      let scaled;
      if (hasCached) {
        const isRW = sectionName === 'reading_writing';
        scaled = isRW ? a.rw_scaled : a.math_scaled;
      }
      if (scaled == null) {
        const lookupKey = `${a.practice_test_id}/${sectionName}`;
        scaled = computeScaledScore({
          section: sectionName,
          m1Correct: m1.correct,
          m2Correct: m2.correct,
          routeCode: m2.routeCode,
          lookupRows: lookupByTestSection[lookupKey] || [],
        });
      }

      sectionScores[subj] = { correct: m1.correct + m2.correct, total: m1.correct + m2.correct, scaled };
      // Only compute composite for full (both sections) tests
      const sectionsMode = a.metadata?.sections;
      if (!sectionsMode) {
        composite = (composite || 0) + scaled;
      }
    }

    // Use the cached composite if available (most authoritative), only for full tests
    const sectionsMode = a.metadata?.sections;
    if (hasCached && !sectionsMode) composite = a.composite_score;

    return { ...a, composite, sectionScores, sectionsMode };
  });

  return { tests, attempts };
}
