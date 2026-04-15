-- ═══════════════════════════════════════════════════════════════════════
-- SAT Practice Test 6 RW M2 Hard — INSERT ordinal 14
-- ═══════════════════════════════════════════════════════════════════════
-- INI / Inferences — Gidna/Yravedra/Domínguez-Rodrigo captive lions study
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
    '8b422b91-e8e0-4fa8-9042-bde638fd7c71',
    '2e1f8f32-a777-4054-8d3c-eb9c67653469',
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
    $BODY$<p>Which choice most logically completes the text?</p>$BODY$,
    $BODY$<p>In a <span data-ssml-say-as="date">2013</span> study, Agness Gidna, José Yravedra, and Manuel Domínguez-Rodrigo compared the feeding behaviors of wild lions in Tanzania&rsquo;s Tarangire National Park with those of captive lions in Spain&rsquo;s Cabárceno Reserve. The researchers noted that previous studies focused on other carnivores have shown that providing animals with food at regular intervals, as is common in captive settings, may inadvertently facilitate the development of novel stereotypic (<span data-ssml-sub-alias="i e">i.e.</span>, purposelessly repetitive) behaviors by reducing the need for a high degree of cognitive engagement with the environment; the researchers were therefore not altogether surprised to find that <span aria-hidden="true">______</span><span class="sr-only">blank</span></p>$BODY$,
    $BODY$<p>Choice A is the best answer because it most logically completes the text&rsquo;s discussion of the research on feeding behaviors of wild and captive lions. The text indicates that Gidna, Yravedra, and Dom&iacute;nguez-Rodrigo compared the behaviors of wild lions in a national park with those of captive lions in a reserve. The text also establishes that the researchers were familiar with earlier studies showing that regularly offering food to captive animals reduces the need for cognitive engagement with the environment and can lead the animals to develop novel stereotypic behaviors, or new behaviors that are repetitive without a clear purpose. It follows, then, that the researchers weren&rsquo;t surprised to find that unlike the wild lions, the captive lions continued gnawing on the bones of provided carcasses even when the bones no longer provided nutrients, because this would be an example of captive animals developing a new and purposelessly repetitive behavior.</p><p>Choice B is incorrect because the text suggests that the researchers&rsquo; findings were consistent with earlier findings that animals may develop novel stereotypic behaviors in captivity, and there&rsquo;s no reason to think that displaying aggression during feeding is a purposelessly repetitive behavior or that it was newly developed by lions in captivity, especially if the researchers found that wild lions also showed aggression during feeding. Choice C is incorrect because the text suggests that the researchers&rsquo; findings were consistent with previous findings that novel stereotypic behaviors can develop when captive animals lack cognitive engagement with their environments. It therefore isn&rsquo;t logical to conclude that the researchers weren&rsquo;t surprised to find that captive lions engaged in repetitive behaviors in an environment with a cognitively demanding feeding system, especially if those behaviors were similar to those seen in wild lions, because that finding wouldn&rsquo;t be an example of a new behavior developing in captivity as a result of low cognitive engagement. Choice D is incorrect because the text suggests that the researchers&rsquo; findings were consistent with earlier findings that animals may develop new purposelessly repetitive behaviors in captivity. It isn&rsquo;t logical to conclude that the researchers weren&rsquo;t surprised to find that both captive and wild lions engage in stereotypic pacing before a feeding activity, since that finding would be an example of a repetitive behavior shared by wild and captive animals rather than one that newly developed in captivity.</p>$BODY$
  )
  RETURNING id INTO v_version_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 0, 'A',
          $BODY$<p>bones from carcasses provided to captive lions showed signs of extensive gnawing beyond the point of nutrient extraction, whereas bones from prey hunted by wild lions did not.&nbsp;</p>$BODY$)
  RETURNING id INTO v_opt_a_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 1, 'B',
          $BODY$<p>during feeding episodes, captive male lions showed much more aggression than did wild male lions, whereas female captive and wild lions showed similar levels of aggression.</p>$BODY$)
  RETURNING id INTO v_opt_b_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 2, 'C',
          $BODY$<p>when caretakers placed food in boxes that were cognitively demanding to open, captive lions showed repeated behaviors similar to those that wild lions show when stalking prey.&nbsp;</p>$BODY$)
  RETURNING id INTO v_opt_c_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 3, 'D',
          $BODY$<p>captive lions showed a stereotypic behavior of pacing in their enclosures as feeding times approached, whereas wild lions showed a stereotypic behavior of pacing before embarking on a hunt.</p>$BODY$)
  RETURNING id INTO v_opt_d_id;

  INSERT INTO correct_answers (id, question_version_id, answer_type, correct_option_id)
  VALUES (gen_random_uuid(), v_version_id, 'mcq', v_opt_a_id);

  INSERT INTO question_taxonomy (
    question_id, program, domain_code, domain_name, skill_code, skill_name, difficulty
  )
  VALUES (
    v_question_id,
    'SAT',
    'INI', 'Information and Ideas',
    'INF', 'Inferences',
    3
  );

  UPDATE practice_test_module_items
     SET question_version_id = v_version_id
   WHERE practice_test_module_id = v_module_id
     AND ordinal = 14;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'expected 1 module_item row updated at ordinal 14, got %', v_updated;
  END IF;

  RAISE NOTICE 'Inserted question % at ordinal 14', v_question_id;
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
  AND ptmi.ordinal = 14;

ROLLBACK;
