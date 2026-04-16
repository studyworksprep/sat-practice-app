// Performance-stats loader for the admin performance page.
// Ported from the legacy /api/admin/student-performance route.
//
// The aggregation is heavy (~ten queries, dedup + join + bucket)
// so it lives in its own module. The page Server Component calls
// one function and renders the results.

const FIRST_ATTEMPT_WINDOW_DAYS = 30;
const MIN_ATTEMPTS_FOR_RANKING = 5;
const MIN_ATTEMPTS_FOR_SKILL = 3;
const BUCKET_MIN = 400;
const BUCKET_MAX = 1500;
const BUCKET_STEP = 100;

export async function loadPerformanceStats(supabase) {
  const now = new Date();
  const d30 = new Date(now); d30.setDate(d30.getDate() - FIRST_ATTEMPT_WINDOW_DAYS);
  const d60 = new Date(now); d60.setDate(d60.getDate() - 2 * FIRST_ATTEMPT_WINDOW_DAYS);

  const [currentAttempts, previousAttempts] = await Promise.all([
    fetchAttempts(supabase, d30, now),
    fetchAttempts(supabase, d60, d30),
  ]);

  const current = dedupFirstAttempts(currentAttempts);
  const previous = dedupFirstAttempts(previousAttempts);

  const overallAccuracy = {
    current: accuracyPct(current),
    previous: accuracyPct(previous),
    totalAttempts: current.length,
    domains: [],
  };

  const skillMap = {};

  if (current.length > 0) {
    const questionIds = [...new Set(current.map((a) => a.question_id))];
    const taxMap = await fetchTaxonomy(supabase, questionIds);

    const domainAgg = {};
    for (const a of current) {
      const tax = taxMap[a.question_id];
      if (!tax) continue;
      if (tax.domain_code) {
        const d = (domainAgg[tax.domain_code] ??= {
          domain_code: tax.domain_code,
          domain_name: tax.domain_name,
          total: 0,
          correct: 0,
        });
        d.total += 1;
        if (a.is_correct) d.correct += 1;
      }
      if (tax.skill_code) {
        const s = (skillMap[tax.skill_code] ??= {
          skill_code: tax.skill_code,
          skill_name: tax.skill_name,
          domain_code: tax.domain_code,
          domain_name: tax.domain_name,
          total: 0,
          correct: 0,
        });
        s.total += 1;
        if (a.is_correct) s.correct += 1;
      }
    }
    overallAccuracy.domains = Object.values(domainAgg).map((d) => ({
      ...d,
      accuracy: d.total > 0 ? Math.round((d.correct / d.total) * 100) : null,
    }));
  }

  const skillHeatmap = Object.values(skillMap)
    .filter((s) => s.total >= MIN_ATTEMPTS_FOR_SKILL)
    .map((s) => ({ ...s, accuracy: Math.round((s.correct / s.total) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const { hardest, easiest } = await loadHardestEasiest(supabase);
  const scoreDistribution = await loadScoreDistribution(supabase);

  return { overallAccuracy, hardestQuestions: hardest, easiestQuestions: easiest, scoreDistribution, skillHeatmap };
}

async function fetchAttempts(supabase, from, to) {
  const { data } = await supabase
    .from('attempts')
    .select('user_id, question_id, is_correct, created_at')
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString())
    .order('created_at', { ascending: true })
    .limit(10000);
  return data ?? [];
}

function dedupFirstAttempts(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = `${r.user_id}:${r.question_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function accuracyPct(rows) {
  if (rows.length === 0) return null;
  const correct = rows.filter((r) => r.is_correct).length;
  return Math.round((correct / rows.length) * 100);
}

async function fetchTaxonomy(supabase, questionIds) {
  const taxMap = {};
  for (let i = 0; i < questionIds.length; i += 500) {
    const chunk = questionIds.slice(i, i + 500);
    const { data } = await supabase
      .from('question_taxonomy')
      .select('question_id, domain_code, domain_name, skill_code, skill_name, difficulty')
      .in('question_id', chunk);
    for (const t of data ?? []) taxMap[t.question_id] = t;
  }
  return taxMap;
}

async function loadHardestEasiest(supabase) {
  const { data: qvRows } = await supabase
    .from('question_versions')
    .select('id, question_id, attempt_count, correct_count, questions!inner(question_id)')
    .eq('is_current', true)
    .gte('attempt_count', MIN_ATTEMPTS_FOR_RANKING)
    .order('attempt_count', { ascending: false })
    .limit(2000);

  const scored = (qvRows ?? []).map((qv) => ({
    question_id: qv.question_id,
    display_question_id: qv.questions?.question_id ?? null,
    attempt_count: qv.attempt_count,
    correct_count: qv.correct_count,
    accuracy: Math.round((qv.correct_count / qv.attempt_count) * 100),
  }));
  scored.sort((a, b) => a.accuracy - b.accuracy);

  const hardestSlice = scored.slice(0, 10);
  const easiestSlice = scored.slice(-10).reverse();

  const enrichIds = [...new Set([...hardestSlice, ...easiestSlice].map((q) => q.question_id))];
  const enrichTax = await fetchTaxonomy(supabase, enrichIds);

  const enrich = (q) => {
    const tax = enrichTax[q.question_id] ?? {};
    return {
      question_id: q.display_question_id ?? q.question_id,
      question_uuid: q.question_id,
      attempt_count: q.attempt_count,
      correct_count: q.correct_count,
      accuracy: q.accuracy,
      domain_name: tax.domain_name ?? null,
      skill_name: tax.skill_name ?? null,
      difficulty: tax.difficulty ?? null,
    };
  };

  return { hardest: hardestSlice.map(enrich), easiest: easiestSlice.map(enrich) };
}

async function loadScoreDistribution(supabase) {
  const { data } = await supabase
    .from('practice_test_attempts')
    .select('composite_score, rw_scaled, math_scaled')
    .eq('status', 'completed')
    .not('composite_score', 'is', null);

  const buckets = [];
  for (let lo = BUCKET_MIN; lo <= BUCKET_MAX; lo += BUCKET_STEP) {
    buckets.push({ range: `${lo}-${lo + BUCKET_STEP - 1}`, lo, hi: lo + BUCKET_STEP - 1, count: 0 });
  }

  const rows = data ?? [];
  let sumC = 0, sumR = 0, sumM = 0, nR = 0, nM = 0;

  for (const s of rows) {
    const c = s.composite_score;
    sumC += c;
    if (s.rw_scaled)   { sumR += s.rw_scaled;   nR += 1; }
    if (s.math_scaled) { sumM += s.math_scaled; nM += 1; }
    for (const b of buckets) {
      if (c >= b.lo && c <= b.hi) { b.count += 1; break; }
    }
  }

  return {
    totalTests: rows.length,
    avgComposite: rows.length > 0 ? Math.round(sumC / rows.length) : null,
    avgRW: nR > 0 ? Math.round(sumR / nR) : null,
    avgMath: nM > 0 ? Math.round(sumM / nM) : null,
    // Show buckets with data, plus always the interesting 600–1400 band.
    buckets: buckets.filter((b) => b.count > 0 || (b.lo >= 600 && b.lo <= 1400)),
  };
}
