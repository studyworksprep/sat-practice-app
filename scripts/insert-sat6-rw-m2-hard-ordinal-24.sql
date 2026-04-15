-- ═══════════════════════════════════════════════════════════════════════
-- SAT Practice Test 6 RW M2 Hard — INSERT ordinal 24
-- ═══════════════════════════════════════════════════════════════════════
-- EOI / Transitions — Dairy cows diurnal/nocturnal ("In other words,")
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $OUTER$
DECLARE
  v_module_id   uuid;
  v_question_id uuid;
  v_version_id  uuid;
  v_opt_a_id    uuid;
  v_opt_b_id    uuid;
  v_opt_c_id    uuid;
  v_opt_d_id    uuid;
  v_updated     int;
BEGIN
  SELECT ptm.id INTO v_module_id
  FROM practice_test_modules ptm
  JOIN practice_tests pt ON pt.id = ptm.practice_test_id
  WHERE pt.name = 'SAT Practice Test 6 (Adaptive)'
    AND ptm.subject_code = 'RW'
    AND ptm.module_number = 2
    AND ptm.route_code = 'HARD';

  IF v_module_id IS NULL THEN
    RAISE EXCEPTION 'target module not found';
  END IF;

  INSERT INTO questions (id, source, source_external_id, question_id, status, is_broken)
  VALUES (
    gen_random_uuid(),
    'collegeboard',
    '093a41fa-36ba-4d68-a521-381fa328114e',
    '934e6e18-8f0c-47cf-b548-5763b0e9d6b3',
    'active',
    false
  )
  RETURNING id INTO v_question_id;

  INSERT INTO question_versions (
    id, question_id, version, is_current, question_type,
    stem_html, stimulus_html, rationale_html
  )
  VALUES (
    gen_random_uuid(),
    v_question_id,
    1,
    true,
    'mcq',
    $BODY$<p>Which choice completes the text with the most logical transition?</p>$BODY$,
    $BODY$<p>In a recent study, researchers examined the sleeping and waking habits of a group of dairy cows to determine if the cows&rsquo; patterns of activity suggested that the animals were diurnal, nocturnal, or crepuscular. <span aria-hidden="true">______</span><span class="sr-only">blank</span> the researchers studied whether the cows were most active in the daytime (diurnal), nighttime (nocturnal), or at dawn and dusk (crepuscular).</p>$BODY$,
    $BODY$<p>Choice B is the best answer. "In other words" logically signals that this sentence is a paraphrase of the previous description of the researchers&rsquo; study. It summarizes what the researchers examined and clarifies several terms used in the previous sentence (diurnal, nocturnal, and crepuscular).</p><p>Choice A is incorrect because "afterward" illogically signals that the information in this sentence occurs later in a chronological sequence of events than the previous information about the researchers&rsquo; study. Instead, this sentence is a paraphrase of that information. Choice C is incorrect because "additionally" illogically signals that this sentence provides a separate point in addition to the previous information about the researchers&rsquo; study. Instead, this sentence is a paraphrase of that information. Choice D is incorrect because "however" illogically signals that the information in this sentence contrasts with the previous information about the researchers&rsquo; study. Instead, this sentence is a paraphrase of that information.</p>$BODY$
  )
  RETURNING id INTO v_version_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 0, 'A', $BODY$<p>Afterward,</p>$BODY$)
  RETURNING id INTO v_opt_a_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 1, 'B', $BODY$<p>In other words,</p>$BODY$)
  RETURNING id INTO v_opt_b_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 2, 'C', $BODY$<p>Additionally,</p>$BODY$)
  RETURNING id INTO v_opt_c_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 3, 'D', $BODY$<p>However,</p>$BODY$)
  RETURNING id INTO v_opt_d_id;

  INSERT INTO correct_answers (id, question_version_id, answer_type, correct_option_id)
  VALUES (gen_random_uuid(), v_version_id, 'mcq', v_opt_b_id);

  INSERT INTO question_taxonomy (
    question_id, program, domain_code, domain_name, skill_code, skill_name, difficulty
  )
  VALUES (
    v_question_id,
    'SAT',
    'EOI', 'Expression of Ideas',
    'TRA', 'Transitions',
    3
  );

  UPDATE practice_test_module_items
     SET question_version_id = v_version_id
   WHERE practice_test_module_id = v_module_id
     AND ordinal = 24;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'expected 1 module_item row updated at ordinal 24, got %', v_updated;
  END IF;

  RAISE NOTICE 'Inserted question % at ordinal 24', v_question_id;
END;
$OUTER$;

SELECT
  ptmi.ordinal,
  qt.domain_code, qt.skill_code,
  left(regexp_replace(coalesce(qv.stimulus_html, ''), '<[^>]*>', '', 'g'), 80) AS stimulus_preview
FROM practice_test_module_items ptmi
JOIN practice_test_modules ptm ON ptm.id = ptmi.practice_test_module_id
JOIN practice_tests pt         ON pt.id = ptm.practice_test_id
JOIN question_versions qv      ON qv.id = ptmi.question_version_id
LEFT JOIN question_taxonomy qt ON qt.question_id = qv.question_id
WHERE pt.name = 'SAT Practice Test 6 (Adaptive)'
  AND ptm.subject_code = 'RW'
  AND ptm.module_number = 2
  AND ptm.route_code = 'HARD'
  AND ptmi.ordinal = 24;

ROLLBACK;
