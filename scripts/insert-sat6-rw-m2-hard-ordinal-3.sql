-- ═══════════════════════════════════════════════════════════════════════
-- SAT Practice Test 6 RW M2 Hard — INSERT ordinal 3
-- ═══════════════════════════════════════════════════════════════════════
-- CAS / Words in Context — Social media research ("Redressing")
-- Same template validated by ordinal-1 file. Dry-run by default.
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
    '38f9b682-b22b-4740-ad52-2d8ba39ce79f',
    '9e603ebe-b3ed-4d01-bb61-badf9e33cb77',
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
    $BODY$<p>Which choice completes the text with the most logical and precise word or phrase?</p>$BODY$,
    $BODY$<p><span aria-hidden="true">______</span><span class="sr-only">blank</span> the long-standing trend of overemphasizing teenagers and young adults in research on social media use, scholars have recently begun to expand their focus to include the fastest-growing cohort of social media users: senior citizens.&nbsp;</p>$BODY$,
    $BODY$<p>Choice B is the best answer because it most logically completes the text&rsquo;s discussion about research into social media use. In context, "redressing" means remedying or compensating for. The text indicates that there is a long-standing trend of overemphasizing teenagers and young adults in studies of social media use. It goes on to say that scholars have recently broadened the kinds of social media users they study by including senior citizens. This suggests that scholars are redressing the long-standing trend of overemphasis on younger users by studying older users as well.</p><p>Choice A is incorrect because "exacerbating" means making worse or aggravating, which would not make logical sense in context. Expanding the focus of studies of social media use to include senior citizens would not make the long-standing trend of overemphasizing teenagers and young adults in studies of social media use worse; instead, it would help to remedy this trend. Choice C is incorrect because "epitomizing" means illustrating or providing an example, which would not make logical sense in context. Expanding the groups of social media users that scholars study to include senior citizens would not provide an example of the long-standing trend of overemphasizing teenagers and young people in research on social media use. Choice D is incorrect because "precluding" means making impossible in advance or preventing, which would not make logical sense in context. The text indicates that there is a long-standing trend of overemphasizing teenagers and young adults in social media research. Expanding the focus of social media research to include senior citizens, as the text indicates scholars have begun to do, could help to rectify the trend, but it could not prevent the trend or make the trend impossible in advance, since the trend started long before scholars started expanding their focus.</p>$BODY$
  )
  RETURNING id INTO v_version_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 0, 'A', $BODY$<p>Exacerbating</p>$BODY$)
  RETURNING id INTO v_opt_a_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 1, 'B', $BODY$<p>Redressing</p>$BODY$)
  RETURNING id INTO v_opt_b_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 2, 'C', $BODY$<p>Epitomizing</p>$BODY$)
  RETURNING id INTO v_opt_c_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 3, 'D', $BODY$<p>Precluding</p>$BODY$)
  RETURNING id INTO v_opt_d_id;

  INSERT INTO correct_answers (id, question_version_id, answer_type, correct_option_id)
  VALUES (gen_random_uuid(), v_version_id, 'mcq', v_opt_b_id);

  INSERT INTO question_taxonomy (
    question_id, program, domain_code, domain_name, skill_code, skill_name, difficulty
  )
  VALUES (
    v_question_id,
    'SAT',
    'CAS', 'Craft and Structure',
    'WIC', 'Words in Context',
    3
  );

  UPDATE practice_test_module_items
     SET question_version_id = v_version_id
   WHERE practice_test_module_id = v_module_id
     AND ordinal = 3;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'expected 1 module_item row updated at ordinal 3, got %', v_updated;
  END IF;

  RAISE NOTICE 'Inserted question % at ordinal 3', v_question_id;
END;
$OUTER$;

-- Verification
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
  AND ptmi.ordinal = 3;

-- Change ROLLBACK to COMMIT once the verification row looks right.
ROLLBACK;
