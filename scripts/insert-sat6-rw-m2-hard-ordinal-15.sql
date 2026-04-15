-- ═══════════════════════════════════════════════════════════════════════
-- SAT Practice Test 6 RW M2 Hard — INSERT ordinal 15
-- ═══════════════════════════════════════════════════════════════════════
-- SEC / Form, Structure, and Sense — Escoffier cookbook (subject-verb
-- agreement: "epitomize")
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
    '33508a17-8255-4313-80e7-c1bf9cd505b3',
    'a1a8e9ee-1343-42a8-bad9-dc8ddfcffa21',
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
    $BODY$<p>Which choice completes the text so that it conforms to the conventions of Standard English?</p>$BODY$,
    $BODY$<p>In Auguste Escoffier&rsquo;s <span data-ssml-say-as="date">1903</span> cookbook titled <span lang="fr"><em>Le Guide Culinaire</em></span>, the chef included over 5,000 dishes, including <span lang="fr">Oeufs Aurore</span> (baked eggs), <span lang="fr">Gambas</span> (jumbo shrimp) in garlic sauce, and <span lang="fr">Tarte aux Pignons</span> (pine nut tart). Such iconic French recipes, described in surprisingly brief detail in <span lang="fr"><em>Le Guide Culinaire</em></span>, <span aria-hidden="true">______</span><span class="sr-only">blank</span> the Victorian French cuisine Escoffier sought to preserve in his encyclopedic book.</p>$BODY$,
    $BODY$<p>Choice A is the best answer. The convention being tested is subject-verb agreement. The plural verb "epitomize" agrees in number with the plural subject "recipes."</p><p>Choice B is incorrect because the singular verb "has epitomized" doesn&rsquo;t agree in number with the plural subject "recipes." Choice C is incorrect because the singular verb "epitomizes" doesn&rsquo;t agree in number with the plural subject "recipes." Choice D is incorrect because the singular verb "was epitomizing" doesn&rsquo;t agree in number with the plural subject "recipes."</p>$BODY$
  )
  RETURNING id INTO v_version_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 0, 'A', $BODY$<p>epitomize</p>$BODY$)
  RETURNING id INTO v_opt_a_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 1, 'B', $BODY$<p>has epitomized</p>$BODY$)
  RETURNING id INTO v_opt_b_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 2, 'C', $BODY$<p>epitomizes</p>$BODY$)
  RETURNING id INTO v_opt_c_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 3, 'D', $BODY$<p>was epitomizing</p>$BODY$)
  RETURNING id INTO v_opt_d_id;

  INSERT INTO correct_answers (id, question_version_id, answer_type, correct_option_id)
  VALUES (gen_random_uuid(), v_version_id, 'mcq', v_opt_a_id);

  INSERT INTO question_taxonomy (
    question_id, program, domain_code, domain_name, skill_code, skill_name, difficulty
  )
  VALUES (
    v_question_id,
    'SAT',
    'SEC', 'Standard English Conventions',
    'FSS', 'Form, Structure, and Sense',
    3
  );

  UPDATE practice_test_module_items
     SET question_version_id = v_version_id
   WHERE practice_test_module_id = v_module_id
     AND ordinal = 15;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'expected 1 module_item row updated at ordinal 15, got %', v_updated;
  END IF;

  RAISE NOTICE 'Inserted question % at ordinal 15', v_question_id;
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
  AND ptmi.ordinal = 15;

ROLLBACK;
