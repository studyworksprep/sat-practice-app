-- ═══════════════════════════════════════════════════════════════════════
-- SAT Practice Test 6 RW M2 Hard — INSERT ordinal 26
-- ═══════════════════════════════════════════════════════════════════════
-- EOI / Rhetorical Synthesis — California red-legged frog FWS notes
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
    '476f7e8b-5191-4fec-b811-5afc910ecdb4',
    '6cbdaa37-5611-4ed9-a29b-2c01a68526ce',
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
    $BODY$<p>The student wants to indicate the California red-legged frog&rsquo;s FWS classification category. Which choice most effectively uses relevant information from the notes to accomplish this goal?</p>$BODY$,
    $BODY$<p>While researching a topic, a student has taken the following notes:</p>
<ul>
<li>The US Fish and Wildlife Service (FWS) keeps a list of all at-risk species.</li>
<li>Species on the list are classified as either endangered or threatened.</li>
<li>A species that is in danger of extinction throughout most or all of its range is classified as endangered.</li>
<li>A species that is likely to soon become endangered is classified as threatened.</li>
<li>The California red-legged frog (<em>Rana draytonii</em>) is likely to soon become endangered, according to the FWS.</li>
</ul>$BODY$,
    $BODY$<p>Choice D is the best answer. The sentence effectively indicates the California red-legged frog&rsquo;s FWS classification category, noting that the FWS classifies the frog as threatened, a classification given to species that are likely to soon become endangered.</p><p>Choice A is incorrect. The sentence specifies the classification categories of the FWS list; it doesn&rsquo;t indicate the classification category of the California red-legged frog. Choice B is incorrect. While the sentence does note that the California red-legged frog is among the species classified by the FWS, it doesn&rsquo;t indicate what classification category the California red-legged frog occupies. Choice C is incorrect. While the sentence does appear to indicate the California red-legged frog&rsquo;s FWS classification category, the sentence is factually incorrect and therefore ineffective; the frog&rsquo;s classification category is threatened, not endangered.</p>$BODY$
  )
  RETURNING id INTO v_version_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 0, 'A',
          $BODY$<p>Species on the FWS list, which includes the California red-legged frog (<em>Rana draytonii</em>), are classified as either endangered or threatened.</p>$BODY$)
  RETURNING id INTO v_opt_a_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 1, 'B',
          $BODY$<p>The California red-legged frog (<em>Rana draytonii</em>) appears on the FWS list of at-risk species.</p>$BODY$)
  RETURNING id INTO v_opt_b_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 2, 'C',
          $BODY$<p>According to the FWS, the California red-legged frog is in the endangered category, in danger of extinction throughout most or all of its range.</p>$BODY$)
  RETURNING id INTO v_opt_c_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 3, 'D',
          $BODY$<p>Likely to soon become endangered, the California red-legged frog is classified as threatened by the FWS.</p>$BODY$)
  RETURNING id INTO v_opt_d_id;

  INSERT INTO correct_answers (id, question_version_id, answer_type, correct_option_id)
  VALUES (gen_random_uuid(), v_version_id, 'mcq', v_opt_d_id);

  INSERT INTO question_taxonomy (
    question_id, program, domain_code, domain_name, skill_code, skill_name, difficulty
  )
  VALUES (
    v_question_id,
    'SAT',
    'EOI', 'Expression of Ideas',
    'SYN', 'Rhetorical Synthesis',
    3
  );

  UPDATE practice_test_module_items
     SET question_version_id = v_version_id
   WHERE practice_test_module_id = v_module_id
     AND ordinal = 26;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'expected 1 module_item row updated at ordinal 26, got %', v_updated;
  END IF;

  RAISE NOTICE 'Inserted question % at ordinal 26', v_question_id;
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
  AND ptmi.ordinal = 26;

ROLLBACK;
