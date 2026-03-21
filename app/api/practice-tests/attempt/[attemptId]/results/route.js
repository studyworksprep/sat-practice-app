import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../lib/supabase/server';
import { computeScaledScore, toScaledScore, isHardRoute } from '../../../../../../lib/scoreConversion';

// GET /api/practice-tests/attempt/[attemptId]/results
// Returns full results including scores, domain breakdown, and question review.
export async function GET(_request, { params }) {
  const { attemptId } = params;
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check if user is a teacher/admin who can view other students' results
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const isTeacherOrAdmin = profile?.role === 'teacher' || profile?.role === 'manager' || profile?.role === 'admin';

  // Teachers/admins can view any attempt (RLS will filter); students only their own
  const query = supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, user_id, status, metadata, started_at, finished_at, composite_score, rw_scaled, math_scaled')
    .eq('id', attemptId);

  if (!isTeacherOrAdmin) {
    query.eq('user_id', user.id);
  }

  const { data: attempt, error: attErr } = await query.maybeSingle();

  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 });
  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Reconstruct attempt items from metadata.submitted_modules + module definitions.
  // This works with both practice_test_module_attempts/practice_test_item_attempts
  // and any legacy schema, since submitted_modules is always written to metadata.
  const subjectRouteField = {
    RW: 'rw_route_code', rw: 'rw_route_code',
    M: 'm_route_code', m: 'm_route_code', math: 'm_route_code', Math: 'm_route_code', MATH: 'm_route_code',
  };

  const { data: allModules } = await supabase
    .from('practice_test_modules')
    .select('id, subject_code, module_number, route_code')
    .eq('practice_test_id', attempt.practice_test_id);

  const attemptItems = [];
  for (const key of attempt.metadata?.submitted_modules || []) {
    const slash = key.lastIndexOf('/');
    const subj = key.slice(0, slash);
    const modNum = parseInt(key.slice(slash + 1), 10);

    const routeCode =
      modNum === 1
        ? allModules?.find((m) => m.subject_code === subj && m.module_number === 1)?.route_code
        : attempt.metadata?.[subjectRouteField[subj]];

    const modRow = allModules?.find(
      (m) => m.subject_code === subj && m.module_number === modNum && m.route_code === routeCode
    );
    if (!modRow) continue;

    const { data: modItems } = await supabase
      .from('practice_test_module_items')
      .select('ordinal, question_version_id')
      .eq('practice_test_module_id', modRow.id)
      .order('ordinal', { ascending: true });

    for (const item of modItems || []) {
      attemptItems.push({
        subject_code: subj,
        module_number: modNum,
        route_code: routeCode,
        ordinal: item.ordinal,
        question_version_id: item.question_version_id,
      });
    }
  }

  const versionIds = [...new Set(attemptItems.map((i) => i.question_version_id))];

  if (!versionIds.length) {
    return NextResponse.json({ error: 'No attempt items found' }, { status: 404 });
  }

  // Fetch question versions (content)
  const { data: versions } = await supabase
    .from('question_versions')
    .select('id, question_id, stimulus_html, stem_html, question_type, rationale_html')
    .in('id', versionIds);

  const versionMap = {};
  for (const v of versions || []) versionMap[v.id] = v;

  const questionIds = [...new Set((versions || []).map((v) => v.question_id))];

  // Fetch answer options
  const { data: options } = await supabase
    .from('answer_options')
    .select('id, question_version_id, ordinal, label, content_html')
    .in('question_version_id', versionIds)
    .order('ordinal', { ascending: true });

  const optionsByVersion = {};
  for (const o of options || []) {
    if (!optionsByVersion[o.question_version_id]) optionsByVersion[o.question_version_id] = [];
    optionsByVersion[o.question_version_id].push(o);
  }

  // Fetch correct answers
  const { data: correctAnswers } = await supabase
    .from('correct_answers')
    .select('question_version_id, answer_type, correct_option_id, correct_option_ids, correct_text, correct_number, numeric_tolerance')
    .in('question_version_id', versionIds);

  const correctByVersion = {};
  for (const ca of correctAnswers || []) correctByVersion[ca.question_version_id] = ca;

  // Fetch user's answers scoped to THIS practice test attempt only.
  // Join chain: practice_test_module_attempts → practice_test_item_attempts → attempts
  // This prevents answers from previous attempts / other tests bleeding through.
  const { data: moduleAttemptRows } = await supabase
    .from('practice_test_module_attempts')
    .select('id')
    .eq('practice_test_attempt_id', attemptId);

  const moduleAttemptIds = (moduleAttemptRows || []).map((r) => r.id);

  const { data: itemAttemptRows } = moduleAttemptIds.length
    ? await supabase
        .from('practice_test_item_attempts')
        .select('attempt_id')
        .in('practice_test_module_attempt_id', moduleAttemptIds)
    : { data: [] };

  const attemptIds = [...new Set((itemAttemptRows || []).map((r) => r.attempt_id).filter(Boolean))];

  const { data: userAttempts } = attemptIds.length
    ? await supabase
        .from('attempts')
        .select('id, question_id, selected_option_id, response_text, time_spent_ms')
        .in('id', attemptIds)
    : { data: [] };

  const latestAttempt = {};
  for (const a of userAttempts || []) {
    latestAttempt[a.question_id] = a;
  }

  // Fetch taxonomy for domain/skill breakdown
  const { data: taxonomy } = await supabase
    .from('question_taxonomy')
    .select('question_id, domain_name, domain_code, skill_name, skill_code, difficulty, score_band')
    .in('question_id', questionIds);

  // Build a global skill_code → skill_name lookup from ALL taxonomy rows (not just this attempt)
  const skillCodes = [...new Set((taxonomy || []).map(t => t.skill_code).filter(Boolean))];
  const skillCodeToName = {};
  if (skillCodes.length > 0) {
    const { data: allSkills } = await supabase
      .from('question_taxonomy')
      .select('skill_code, skill_name')
      .in('skill_code', skillCodes)
      .not('skill_name', 'is', null)
      .limit(500);
    for (const s of allSkills || []) {
      if (s.skill_code && s.skill_name) skillCodeToName[s.skill_code] = s.skill_name;
    }
  }

  // Fallback for standard SAT skill codes missing from the database
  const SAT_SKILL_NAMES = {
    WIC: 'Words in Context', TSP: 'Text Structure and Purpose', CTC: 'Cross-Text Connections',
    CID: 'Central Ideas and Details', COE: 'Command of Evidence', INF: 'Inferences',
    BOU: 'Boundaries', FSS: 'Form, Structure, and Sense', TRA: 'Transitions',
    RHE: 'Rhetorical Synthesis',
    ALG: 'Algebra', ATM: 'Advanced Math', PAM: 'Problem-Solving and Data Analysis',
    GEO: 'Geometry and Trigonometry',
  };
  for (const [code, name] of Object.entries(SAT_SKILL_NAMES)) {
    if (!skillCodeToName[code]) skillCodeToName[code] = name;
  }

  const taxByQuestion = {};
  for (const t of taxonomy || []) {
    taxByQuestion[t.question_id] = t;
  }
  // Helper: resolve a human-readable skill name from taxonomy row
  const resolveSkillName = (tax) => tax.skill_name || skillCodeToName[tax.skill_code] || tax.skill_code || 'Unknown';

  // --- Aggregate scores ---
  const sectionStats = {}; // subject_code → { correct, total }
  const moduleStats = {};  // `${subject_code}/${module_number}` → { correct, total, routeCode }
  const domainStats = {};  // domain_name → { correct, total, skill_name }
  const questionReview = [];

  // Helper: parse correct_text which may be a plain string or JSON array like '["77","77.0"]'
  const parseSprAccepted = (ct) => {
    if (!ct) return [];
    const t = String(ct).trim();
    if (t.startsWith('[') && t.endsWith(']')) {
      try { const p = JSON.parse(t); if (Array.isArray(p)) return p.map(String); } catch {}
    }
    return [t];
  };
  const normText = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  for (const item of attemptItems || []) {
    const version = versionMap[item.question_version_id];
    if (!version) continue;
    const qid = version.question_id;
    const attempt_rec = latestAttempt[qid];
    const was_answered = !!attempt_rec;
    const tax = taxByQuestion[qid] || {};
    const ca = correctByVersion[item.question_version_id];

    // Recompute correctness from live answer-key data.
    // Drive comparison by what data is present, not answer_type, so null/unexpected
    // answer_type values in the DB don't cause correct answers to show as wrong.
    let is_correct = false;
    if (attempt_rec && ca) {
      if (attempt_rec.selected_option_id) {
        // MCQ-style: student picked an option
        if (ca.correct_option_id) {
          is_correct = ca.correct_option_id === attempt_rec.selected_option_id;
        }
        if (!is_correct && ca.correct_option_ids?.length) {
          is_correct = ca.correct_option_ids.includes(attempt_rec.selected_option_id);
        }
      } else if (attempt_rec.response_text) {
        // Free-response: compare text first, then numeric
        const accepted = parseSprAccepted(ca.correct_text);
        is_correct = accepted.some((a) => normText(a) === normText(attempt_rec.response_text));
        if (!is_correct && ca.correct_number != null) {
          const parsed = parseFloat(attempt_rec.response_text);
          if (!isNaN(parsed)) {
            const tol = parseFloat(ca.numeric_tolerance) || 0;
            is_correct = Math.abs(parsed - parseFloat(ca.correct_number)) <= tol;
          }
        }
      }
    }

    // Section stats
    const subj = item.subject_code;
    if (!sectionStats[subj]) sectionStats[subj] = { correct: 0, total: 0 };
    sectionStats[subj].total += 1;
    if (is_correct) sectionStats[subj].correct += 1;

    // Per-module stats (for adaptive scoring)
    const modKey = `${subj}/${item.module_number}`;
    if (!moduleStats[modKey]) moduleStats[modKey] = { correct: 0, total: 0, routeCode: item.route_code };
    moduleStats[modKey].total += 1;
    if (is_correct) moduleStats[modKey].correct += 1;

    // Domain stats
    const domainKey = tax.domain_name || 'Unknown';
    if (!domainStats[domainKey]) {
      domainStats[domainKey] = {
        domain_name: domainKey,
        domain_code: tax.domain_code || null,
        subject_code: subj,
        correct: 0,
        total: 0,
        skills: {},
      };
    }
    domainStats[domainKey].total += 1;
    if (is_correct) domainStats[domainKey].correct += 1;

    const skillKey = resolveSkillName(tax);
    if (!domainStats[domainKey].skills[skillKey]) {
      domainStats[domainKey].skills[skillKey] = { correct: 0, total: 0, skill_code: tax.skill_code || null };
    }
    domainStats[domainKey].skills[skillKey].total += 1;
    if (is_correct) domainStats[domainKey].skills[skillKey].correct += 1;

    // Question review entry
    questionReview.push({
      subject_code: item.subject_code,
      module_number: item.module_number,
      ordinal: item.ordinal,
      question_version_id: item.question_version_id,
      question_id: qid,
      question_type: version.question_type,
      stimulus_html: version.stimulus_html && version.stimulus_html !== 'NULL' ? version.stimulus_html : null,
      stem_html: version.stem_html,
      options: optionsByVersion[item.question_version_id] || [],
      correct_answer: ca || null,
      was_answered,
      is_correct,
      selected_option_id: attempt_rec?.selected_option_id || null,
      response_text: attempt_rec?.response_text || null,
      domain_name: tax.domain_name || null,
      skill_name: resolveSkillName(tax),
      difficulty: tax.difficulty ?? null,
      score_band: tax.score_band ?? null,
      time_spent_ms: attempt_rec?.time_spent_ms ?? null,
      rationale_html: version.rationale_html || null,
    });
  }

  // Map subject codes to score_conversion section names
  const subjToSection = {
    RW: 'reading_writing', rw: 'reading_writing',
    M: 'math', m: 'math', math: 'math', Math: 'math', MATH: 'math',
  };

  // Fetch score_conversion lookup rows for this test
  const { data: lookupData } = await supabase
    .from('score_conversion')
    .select('section, module1_correct, module2_correct, scaled_score')
    .eq('test_id', attempt.practice_test_id);

  const lookupBySection = {};
  for (const row of lookupData || []) {
    if (!lookupBySection[row.section]) lookupBySection[row.section] = [];
    lookupBySection[row.section].push(row);
  }

  // Build section scores using per-module data + lookup table.
  // Only trust cached scores from Bluebook uploads (teacher-entered official scores).
  // For all other attempts, always recompute to pick up scoring fixes.
  const uploadSource = attempt.metadata?.upload_source;
  const isBluebookUpload = uploadSource === 'bluebook' || uploadSource === 'score_only';
  const hasCachedScores = isBluebookUpload && attempt.composite_score != null && (attempt.rw_scaled != null || attempt.math_scaled != null);

  const sections = {};
  for (const [subj, stats] of Object.entries(sectionStats)) {
    const m1 = moduleStats[`${subj}/1`] || { correct: 0, total: 0 };
    const m2 = moduleStats[`${subj}/2`] || { correct: 0, total: 0 };
    const sectionName = subjToSection[subj] || 'math';

    let scaled;
    if (hasCachedScores) {
      // Use the cached score for this section (from Bluebook upload)
      const isRW = sectionName === 'reading_writing';
      scaled = isRW ? attempt.rw_scaled : attempt.math_scaled;
    }

    // Fall back to computation if no cached score for this section
    if (scaled == null) {
      scaled = computeScaledScore({
        section: sectionName,
        m1Correct: m1.correct,
        m2Correct: m2.correct,
        routeCode: m2.routeCode || null,
        lookupRows: lookupBySection[sectionName] || [],
      });
    }

    sections[subj] = {
      ...stats,
      m1Correct: m1.correct,
      m1Total: m1.total,
      m2Correct: m2.correct,
      m2Total: m2.total,
      routeCode: m2.routeCode || null,
      scaled,
    };
  }

  const composite = hasCachedScores
    ? attempt.composite_score
    : Object.values(sections).reduce((s, sec) => s + sec.scaled, 0);

  // Cache computed scores on the attempt row for faster dashboard queries.
  // Always update for non-Bluebook attempts to pick up scoring fixes.
  if (!isBluebookUpload && composite > 0) {
    const rwScaled = sections['RW']?.scaled || sections['rw']?.scaled || null;
    const mathScaled = sections['M']?.scaled || sections['m']?.scaled || sections['MATH']?.scaled || sections['math']?.scaled || sections['Math']?.scaled || null;
    await supabase
      .from('practice_test_attempts')
      .update({ composite_score: composite, rw_scaled: rwScaled, math_scaled: mathScaled })
      .eq('id', attemptId);
  }

  // Flatten domain stats
  const domains = Object.values(domainStats).map((d) => ({
    ...d,
    skills: Object.entries(d.skills).map(([skill_name, s]) => ({ skill_name, ...s })),
  }));

  // Fetch practice test name
  const { data: testData } = await supabase
    .from('practice_tests')
    .select('name, code')
    .eq('id', attempt.practice_test_id)
    .single();

  // ── Opportunity Index computation ─────────────────────────────────
  // OI(skill) = (L / 10) × Σ EASE_WEIGHT[band] × MODULE_WEIGHT[route, module]
  // for each wrong question in the skill.
  const EASE_WEIGHT = { 1: 2.2, 2: 2.0, 3: 1.8, 4: 1.6, 5: 1.4, 6: 1.2, 7: 1.0 };
  const MODULE_WEIGHT_EASY = { 1: 1.0, 2: 0.25 };
  const MODULE_WEIGHT_HARD = { 1: 1.0, 2: 1.0 };

  // Fetch learnability ratings
  const { data: learnRows } = await supabase
    .from('skill_learnability')
    .select('skill_code, learnability');

  const learnMap = {};
  for (const r of learnRows || []) learnMap[r.skill_code] = r.learnability;

  // Determine route per subject
  const routeBySubject = {};
  for (const [subj, sec] of Object.entries(sections)) {
    routeBySubject[subj] = isHardRoute(sec.routeCode) ? 'hard' : 'easy';
  }

  // Accumulate OI per skill (keyed by skill_code)
  const oiAccum = {}; // skill_code → { skill_name, domain_name, subject_code, learnability, rawSum, correct, total }
  for (const q of questionReview) {
    const tax = taxByQuestion[q.question_id] || {};
    const skillCode = tax.skill_code;
    if (!skillCode) continue;

    if (!oiAccum[skillCode]) {
      oiAccum[skillCode] = {
        skill_code: skillCode,
        skill_name: resolveSkillName(tax),
        domain_name: tax.domain_name || '',
        subject_code: q.subject_code,
        learnability: learnMap[skillCode] ?? 5,
        rawSum: 0,
        correct: 0,
        total: 0,
      };
    }
    oiAccum[skillCode].total += 1;
    if (q.is_correct) {
      oiAccum[skillCode].correct += 1;
    } else {
      // Wrong question → contributes to opportunity
      const band = tax.score_band || 4;
      const ease = EASE_WEIGHT[band] ?? 1.6;
      const route = routeBySubject[q.subject_code] || 'easy';
      const modWeight = route === 'hard'
        ? (MODULE_WEIGHT_HARD[q.module_number] ?? 1.0)
        : (MODULE_WEIGHT_EASY[q.module_number] ?? 1.0);
      oiAccum[skillCode].rawSum += ease * modWeight;
    }
  }

  const opportunity = Object.values(oiAccum)
    .map(s => ({
      skill_code: s.skill_code,
      skill_name: s.skill_name,
      domain_name: s.domain_name,
      subject_code: s.subject_code,
      learnability: s.learnability,
      correct: s.correct,
      total: s.total,
      opportunity_index: Math.round(((s.learnability / 10) * s.rawSum) * 100) / 100,
    }))
    .filter(s => s.opportunity_index > 0)
    .sort((a, b) => b.opportunity_index - a.opportunity_index);

  // ── Student & teacher profile for PDF header ───────────────────────────
  const studentId = attempt.user_id;
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('first_name, last_name, email, high_school, graduation_year, target_sat_score')
    .eq('id', studentId)
    .maybeSingle();

  const { data: teacherAssignment } = await supabase
    .from('teacher_student_assignments')
    .select('teacher_id')
    .eq('student_id', studentId)
    .limit(1)
    .maybeSingle();

  let teacherProfile = null;
  if (teacherAssignment?.teacher_id) {
    const { data: tp } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', teacherAssignment.teacher_id)
      .maybeSingle();
    teacherProfile = tp;
  }

  return NextResponse.json({
    attempt_id: attemptId,
    practice_test_id: attempt.practice_test_id,
    test_name: testData?.name || '',
    test_code: testData?.code || '',
    status: attempt.status,
    started_at: attempt.started_at,
    completed_at: attempt.finished_at,
    composite,
    sections,
    domains,
    questions: questionReview,
    opportunity,
    student: studentProfile ? {
      name: [studentProfile.first_name, studentProfile.last_name].filter(Boolean).join(' ') || null,
      email: studentProfile.email,
      high_school: studentProfile.high_school || null,
      graduation_year: studentProfile.graduation_year || null,
      target_sat_score: studentProfile.target_sat_score || null,
    } : null,
    teacher: teacherProfile ? {
      name: [teacherProfile.first_name, teacherProfile.last_name].filter(Boolean).join(' ') || null,
      email: teacherProfile.email,
    } : null,
  });
}
