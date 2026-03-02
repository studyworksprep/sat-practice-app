import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/server';
import StartTestButton from './StartTestButton';

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

export default async function PracticeTestListPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { tests, attempts } = await fetchData(supabase, user.id);

  // Group attempts by practice_test_id
  const attemptsByTest = {};
  for (const a of attempts) {
    if (!attemptsByTest[a.practice_test_id]) attemptsByTest[a.practice_test_id] = [];
    attemptsByTest[a.practice_test_id].push(a);
  }

  const SUBJECT_LABELS = { rw: 'Reading & Writing', math: 'Math' };

  return (
    <main className="container" style={{ maxWidth: 720, paddingTop: 32, paddingBottom: 48 }}>
      <h1 className="h1" style={{ marginBottom: 4 }}>Practice Tests</h1>
      <p className="muted small" style={{ marginBottom: 28 }}>
        Full-length, adaptive SAT practice tests with timed modules.
      </p>

      {tests.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <p className="muted">No practice tests are available yet.</p>
        </div>
      )}

      {tests.map((test) => {
        const testAttempts = attemptsByTest[test.id] || [];
        const inProgress = testAttempts.find((a) => a.status === 'in_progress');
        const completed = testAttempts.filter((a) => a.status === 'completed');

        const totalQ = test.modules
          .filter((m) => m.module_number === 1)
          .reduce((s, m) => s + m.question_count, 0) * 2; // ×2 for both modules

        return (
          <div key={test.id} className="card ptTestCard">
            {/* Header */}
            <div className="ptTestHeader">
              <div>
                <div className="h2" style={{ marginBottom: 2 }}>{test.name}</div>
                <div className="muted small">
                  {test.is_adaptive ? 'Adaptive' : 'Linear'} · ~{totalQ} questions ·{' '}
                  {test.subjects.map((s) => SUBJECT_LABELS[s] || s).join(', ')}
                </div>
              </div>
              <div className="ptTestActions">
                {inProgress ? (
                  <Link href={`/practice-test/attempt/${inProgress.id}`} className="btn">
                    Resume
                  </Link>
                ) : (
                  <StartTestButton practiceTestId={test.id} />
                )}
              </div>
            </div>

            {/* In-progress badge */}
            {inProgress && (
              <div className="ptInProgressNote">
                In-progress test started {fmt(inProgress.started_at)}
              </div>
            )}

            {/* Past completed attempts */}
            {completed.length > 0 && (
              <div className="ptPastAttempts">
                <div className="ptPastLabel">Past results</div>
                {completed.map((a) => (
                  <div key={a.id} className="ptAttemptRow">
                    <div className="ptAttemptDate">{fmt(a.completed_at || a.started_at)}</div>
                    <div className="ptAttemptScores">
                      {a.composite != null && (
                        <ScoreBadge score={a.composite} label="Total" />
                      )}
                      {Object.entries(a.sectionScores || {}).map(([subj, s]) => (
                        <ScoreBadge key={subj} score={s.scaled} label={SUBJECT_LABELS[subj] || subj} />
                      ))}
                    </div>
                    <Link href={`/practice-test/attempt/${a.id}/results`} className="btn secondary ptAttemptBtn">
                      Review
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </main>
  );
}

// Direct Supabase query to avoid self-referential fetch in server component
async function fetchData(supabase, userId) {
  const { toScaledScore } = await import('../../lib/scoreConversion');

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
  for (const mod of modulesRaw || []) {
    if (!modulesByTest[mod.practice_test_id]) modulesByTest[mod.practice_test_id] = [];
    modulesByTest[mod.practice_test_id].push({ ...mod, question_count: itemsByModule[mod.id] || 0 });
  }

  const tests = (testsRaw || []).map((t) => {
    const mods = modulesByTest[t.id] || [];
    const subjects = [...new Set(mods.map((m) => m.subject_code))];
    return { ...t, subjects, modules: mods };
  });

  const { data: attemptsRaw } = await supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, status, rw_route_code, m_route_code, started_at, completed_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });

  const completedIds = (attemptsRaw || []).filter((a) => a.status === 'completed').map((a) => a.id);
  let scoresByAttempt = {};

  if (completedIds.length > 0) {
    const { data: attemptItems } = await supabase
      .from('practice_test_attempt_items')
      .select('practice_test_attempt_id, subject_code, question_version_id')
      .in('practice_test_attempt_id', completedIds);

    if (attemptItems?.length) {
      const vids = [...new Set(attemptItems.map((i) => i.question_version_id))];
      const { data: vers } = await supabase.from('question_versions').select('id, question_id').in('id', vids);
      const v2q = {};
      for (const v of vers || []) v2q[v.id] = v.question_id;
      const qids = [...new Set(Object.values(v2q))];
      const { data: attData } = await supabase.from('attempts').select('question_id, is_correct').eq('user_id', userId).in('question_id', qids);
      const latestByQ = {};
      for (const a of attData || []) { if (!latestByQ[a.question_id]) latestByQ[a.question_id] = a.is_correct; }

      for (const item of attemptItems) {
        const qid = v2q[item.question_version_id];
        const aid = item.practice_test_attempt_id;
        const subj = item.subject_code;
        if (!scoresByAttempt[aid]) scoresByAttempt[aid] = {};
        if (!scoresByAttempt[aid][subj]) scoresByAttempt[aid][subj] = { correct: 0, total: 0 };
        scoresByAttempt[aid][subj].total += 1;
        if (qid && latestByQ[qid]) scoresByAttempt[aid][subj].correct += 1;
      }
    }
  }

  const attempts = (attemptsRaw || []).map((a) => {
    const subjScores = scoresByAttempt[a.id] || {};
    const sectionScores = {};
    let composite = null;
    for (const [subj, { correct, total }] of Object.entries(subjScores)) {
      const scaled = toScaledScore(correct, total);
      sectionScores[subj] = { correct, total, scaled };
      composite = (composite || 0) + scaled;
    }
    return { ...a, composite, sectionScores };
  });

  return { tests, attempts };
}
