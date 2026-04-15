-- ═══════════════════════════════════════════════════════════════════════
-- SAT Practice Test 6 RW M2 Hard — INSERT template validation (ordinal 1)
-- ═══════════════════════════════════════════════════════════════════════
-- Part 2 of a 3-part repair. Inserts ONE missing question (ordinal 1 —
-- "War of 1812, tenuous") into the legacy five-table question schema
-- and re-links practice_test_module_items at ordinal 1 of the target
-- module to point at the new row.
--
-- Dry-run by default (BEGIN; ... ROLLBACK;). Run as-is, review the two
-- verification grids that come back, and only flip to COMMIT after
-- you're happy. The whole point of this file is to validate the
-- pattern on a single question before applying it to the other five —
-- if anything fails here (constraint, trigger, missing column, etc.)
-- we fix the template once instead of six times.
--
-- What it writes, in order:
--   1. questions                  — one row (new question entity)
--   2. question_versions          — one row, version=1, is_current=true
--   3. answer_options             — four rows (A/B/C/D)
--   4. correct_answers            — one row linking to the correct option
--   5. question_taxonomy          — one row (CAS / Craft and Structure / WIC)
--   6. practice_test_module_items — UPDATE ordinal 1 in the target module
--
-- Content source: Bluebook MyPractice Details JSON for Practice Test 6
-- Reading Module 2 Hard, displayNumber 1.
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
  -- ── Locate target module ──────────────────────────────────────────
  SELECT ptm.id INTO v_module_id
  FROM practice_test_modules ptm
  JOIN practice_tests pt ON pt.id = ptm.practice_test_id
  WHERE pt.name = 'SAT Practice Test 6 (Adaptive)'
    AND ptm.subject_code = 'RW'
    AND ptm.module_number = 2
    AND ptm.route_code = 'HARD';

  IF v_module_id IS NULL THEN
    RAISE EXCEPTION 'target module not found (Practice Test 6 / RW / M2 / HARD)';
  END IF;

  -- ── 1. questions ──────────────────────────────────────────────────
  INSERT INTO questions (id, source, source_external_id, question_id, status, is_broken)
  VALUES (
    gen_random_uuid(),
    'collegeboard',
    'f46e5ae7-df68-4fff-9fed-f7c1c9be6f1c',
    'bf3b95b0-1d6e-4f11-86fb-c82fcc34a667',
    'active',
    false
  )
  RETURNING id INTO v_question_id;

  -- ── 2. question_versions ──────────────────────────────────────────
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
    $BODY$<p>The War of 1812 has <span aria-hidden="true">______</span><span class="sr-only">blank</span> place in historical memory in Britain, partly because it is overshadowed by the much larger concurrent conflict against Napoleonic France and partly because it essentially maintained the geopolitical status quo for Britain: the country neither gained nor lost significant territory or position as a result of its participation in the war.&nbsp;</p>$BODY$,
    $BODY$<p>Choice A is the best answer because it most logically completes the text&rsquo;s discussion of the significance of the War of 1812 in British historical memory. In this context, "tenuous" means vulnerable or uncertain. The text indicates that the War of 1812 was both smaller, and less prominent, than the conflict with France, and resulted in no significant geopolitical changes. These details imply that the War of 1812 is less likely than other British historical events to be remembered, giving the War of 1812 a tenuous place in British historical memory.</p><p>Choice B is incorrect because in this context "enduring" would mean lasting or durable, but the text describes the War of 1812 as being overshadowed by, and smaller than, the simultaneous conflict with France. This seems to conflict with the notion that the War of 1812 has an enduring place in British historical memory. Choice C is incorrect because in this context "contentious" would mean likely to cause disagreement, and while there likely are contentious issues related to the War of 1812, nothing in the text discusses or implies any such disagreement. Choice D is incorrect because in this context "conspicuous" would mean obvious, but the text describes the War of 1812 as being overshadowed by, and smaller than, the simultaneous conflict with France. Rather than suggesting that the War of 1812 has a conspicuous place in British historical memory, these descriptions suggest that its place is not particularly obvious.</p>$BODY$
  )
  RETURNING id INTO v_version_id;

  -- ── 3. answer_options (4 rows) ────────────────────────────────────
  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 0, 'A', $BODY$<p>a tenuous</p>$BODY$)
  RETURNING id INTO v_opt_a_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 1, 'B', $BODY$<p>an enduring</p>$BODY$)
  RETURNING id INTO v_opt_b_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 2, 'C', $BODY$<p>a contentious</p>$BODY$)
  RETURNING id INTO v_opt_c_id;

  INSERT INTO answer_options (id, question_version_id, ordinal, label, content_html)
  VALUES (gen_random_uuid(), v_version_id, 3, 'D', $BODY$<p>a conspicuous</p>$BODY$)
  RETURNING id INTO v_opt_d_id;

  -- ── 4. correct_answers ────────────────────────────────────────────
  INSERT INTO correct_answers (id, question_version_id, answer_type, correct_option_id)
  VALUES (gen_random_uuid(), v_version_id, 'mcq', v_opt_a_id);

  -- ── 5. question_taxonomy ──────────────────────────────────────────
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

  -- ── 6. practice_test_module_items ─────────────────────────────────
  UPDATE practice_test_module_items
     SET question_version_id = v_version_id
   WHERE practice_test_module_id = v_module_id
     AND ordinal = 1;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'expected 1 module_item row updated at ordinal 1, got %', v_updated;
  END IF;

  RAISE NOTICE 'Inserted question % / version % at ordinal 1 of module %',
               v_question_id, v_version_id, v_module_id;
END;
$OUTER$;

-- ── Verification #1: the new question's own rows, linked back together ─
SELECT
  q.id            AS question_uuid,
  q.question_id   AS cb_question_id,
  q.source_external_id,
  qv.id           AS version_uuid,
  qv.version,
  qv.is_current,
  qv.question_type,
  (SELECT count(*) FROM answer_options ao WHERE ao.question_version_id = qv.id) AS option_count,
  ca.correct_option_id,
  (SELECT ao.label FROM answer_options ao WHERE ao.id = ca.correct_option_id) AS correct_label,
  qt.domain_code, qt.domain_name, qt.skill_code, qt.skill_name, qt.difficulty
FROM questions q
JOIN question_versions qv ON qv.question_id = q.id
LEFT JOIN correct_answers  ca ON ca.question_version_id = qv.id
LEFT JOIN question_taxonomy qt ON qt.question_id = q.id
WHERE q.source_external_id = 'f46e5ae7-df68-4fff-9fed-f7c1c9be6f1c';

-- ── Verification #2: ordinal 1 of the target module now points at it ──
SELECT
  ptmi.ordinal,
  ptmi.question_version_id,
  qv.question_type,
  qt.domain_code,
  qt.domain_name,
  qt.skill_code,
  left(regexp_replace(coalesce(qv.stem_html, ''), '<[^>]*>', '', 'g'), 80) AS stem_preview
FROM practice_test_module_items ptmi
JOIN practice_test_modules ptm ON ptm.id = ptmi.practice_test_module_id
JOIN practice_tests pt         ON pt.id = ptm.practice_test_id
JOIN question_versions qv      ON qv.id = ptmi.question_version_id
LEFT JOIN question_taxonomy qt ON qt.question_id = qv.question_id
WHERE pt.name = 'SAT Practice Test 6 (Adaptive)'
  AND ptm.subject_code = 'RW'
  AND ptm.module_number = 2
  AND ptm.route_code = 'HARD'
  AND ptmi.ordinal = 1;

-- ═══════════════════════════════════════════════════════════════════════
-- DRY RUN by default. Review the two grids above. Expected:
--   Grid 1: one row, option_count = 4, correct_label = 'A',
--           domain_code = CAS, skill_code = WIC
--   Grid 2: one row, ordinal = 1, domain_code = CAS, skill_code = WIC,
--           stem_preview starts with "Which choice completes the text..."
-- If either looks off, keep ROLLBACK and paste the output back to me.
-- If both look right, change ROLLBACK to COMMIT and re-run to persist.
-- ═══════════════════════════════════════════════════════════════════════
ROLLBACK;
