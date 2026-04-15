-- ═══════════════════════════════════════════════════════════════════════
-- SAT Practice Test 6 RW M2 Hard repair — PREVIEW (read-only)
-- ═══════════════════════════════════════════════════════════════════════
-- Paste into Supabase SQL Editor. Safe — no writes.
--
-- Reports, for each of the 27 expected RW Module 2 Hard questions:
--   • how (and if) it was matched against the questions table
--   • the question_version_id we'd point the module_item at
--   • the version_id currently sitting in that ordinal
--   • status: ALREADY_CORRECT, WILL_UPDATE, NO_VERSION, or UNMATCHED
--
-- Expected data comes from the Bluebook MyPractice Details export for
-- SAT Practice Test 6 Reading Module 2 Hard. Match keys:
--   external_id     → questions.source_external_id (preferred)
--   question_cb_id  → questions.question_id        (fallback)
-- ═══════════════════════════════════════════════════════════════════════

WITH expected(ordinal, external_id, question_cb_id, correct_choice, primary_cd, hint) AS (
  VALUES
    (1,  'f46e5ae7-df68-4fff-9fed-f7c1c9be6f1c', 'bf3b95b0-1d6e-4f11-86fb-c82fcc34a667', 'A', 'CAS', 'War of 1812 — "tenuous" place'),
    (2,  'c2c803b2-12ef-43e1-9e6f-fd55ed2b943f', '88939500-6ca3-4750-8695-afb043818cde', 'B', 'CAS', 'Kelmscott Press — "manifest in"'),
    (3,  '38f9b682-b22b-4740-ad52-2d8ba39ce79f', '9e603ebe-b3ed-4d01-bb61-badf9e33cb77', 'B', 'CAS', 'Social media research — "Redressing"'),
    (4,  'cc4c76e5-535b-4376-baf9-3c6a772c0cf3', 'af0cc43a-c967-433d-89f6-d20c24ebee78', 'D', 'CAS', 'Baldwin Giovanni''s Room — "disputing"'),
    (5,  '10aedcfb-dfe1-4eac-b1d2-89f7c794f9eb', 'f478d70d-e128-41a9-b459-dbea77f8a809', 'A', 'CAS', 'William H. Johnson underlined sentence function'),
    (6,  '77d9e3c0-d312-40eb-a54b-06a3589a4335', 'fdf15629-65ef-4db7-8315-aabfbc44d758', 'C', 'CAS', 'Chicano movement / Herrera underlined portion'),
    (7,  '4d2152ad-3e95-4ca9-91a8-423758f25623', '70248a22-fa3e-4c0d-9d0c-598ab47174dc', 'D', 'INI', 'Bosco Verticale skeptics'),
    (8,  'c62128d3-85ec-4b5a-8f7e-cedfc5850c29', '4458e7bd-8e6e-4cbe-b29f-2983efdbf5aa', 'C', 'INI', 'Asiedu natural-resource extraction main idea'),
    (9,  '8544d09c-adf1-4069-8362-343c6a32fd8c', '7ac2d7e8-cf0a-4397-a84d-a7ef99e59550', 'C', 'INI', 'Huang/Seager NH3 biosignature'),
    (10, 'ed118154-f369-47fe-850a-70e12f3794d8', 'fe800141-d349-4da8-8720-ad73ea1e01af', 'D', 'INI', 'Wordsworth "Lines Written in Early Spring"'),
    (11, '9d1ab342-87cd-4c5f-8c7e-dbd44981b5e0', 'ffa072ff-7d08-4f5f-8531-4a27a025d1c5', 'D', 'INI', 'Ibáñez sugar maple radial growth graph'),
    (12, '704122ea-86c8-4130-a534-dde9ec1a52b1', '261ec1ec-c0f2-4dce-ba6b-cdf950563ceb', 'D', 'INI', 'TMAO piezophiles supporting finding'),
    (13, '6537fc25-1318-49e9-9e1e-dcc07604c519', 'c0908c13-f977-4319-b422-b1a4405ef5df', 'B', 'INI', 'Persad irrigation / aquifer table'),
    (14, '8b422b91-e8e0-4fa8-9042-bde638fd7c71', '2e1f8f32-a777-4054-8d3c-eb9c67653469', 'A', 'INI', 'Gidna captive lions stereotypic behavior'),
    (15, '33508a17-8255-4313-80e7-c1bf9cd505b3', 'a1a8e9ee-1343-42a8-bad9-dc8ddfcffa21', 'A', 'SEC', 'Escoffier Le Guide Culinaire — epitomize'),
    (16, 'e402c9de-ec5c-4fe3-ae02-d6233c202224', 'e5233e18-d8ef-4b79-a361-a7ff52c217b7', 'B', 'SEC', 'Pinhole camera — "works. Because"'),
    (17, '849dbfd4-a703-4e5f-9a77-444840ef8712', 'c2b041dc-bc0a-4e73-946b-1594350ffd7c', 'B', 'SEC', 'Marie-Denise Villers portrait punctuation'),
    (18, '27dcef67-fa3b-4d14-8bc9-703bcc36b1b1', '398a4dfe-3b11-4f3c-8635-b37d7abd3782', 'B', 'SEC', 'Sophie Calle photographs — dash/comma'),
    (19, 'ed257044-3bd8-403a-8ea6-516cc4ebcac5', '48b2fd4d-9a97-404c-9d02-d07751af5778', 'C', 'SEC', 'Richard Serra — "Serra, intending"'),
    (20, '0e4cc810-98b3-497e-b9cd-7415d29d1aef', 'a27008d8-837f-4f06-8a6c-f9a3dd7237d6', 'B', 'SEC', 'Byropsis algae toxins — "increase"'),
    (21, '2ff3132b-4962-463f-892c-bc76a6db68bf', 'df7e4310-6a5e-4095-8a4d-d0128cca6627', 'D', 'EOI', 'Jelly Roll Morton transition — "though"'),
    (22, 'c8957ff2-9674-47a3-a4d1-718331694c42', '6e69009b-e13e-4f0f-8de1-093b9f828c54', 'B', 'EOI', 'Henry James editions transition — "in fact"'),
    (23, '475f0dde-a4ec-4f91-b2b4-de36e7b1a6ca', 'b099e609-170e-4ff8-8862-0a7563ac5a4b', 'B', 'EOI', 'Darwin / Wallace transition — "then"'),
    (24, '093a41fa-36ba-4d68-a521-381fa328114e', '934e6e18-8f0c-47cf-b548-5763b0e9d6b3', 'B', 'EOI', 'Dairy cows diurnal transition — "In other words"'),
    (25, '6368be96-9720-4d31-8ba0-50e38b991f78', '2875489a-df1e-4144-8250-f3d290da9662', 'A', 'EOI', 'P waves / S waves similarity notes'),
    (26, '476f7e8b-5191-4fec-b811-5afc910ecdb4', '6cbdaa37-5611-4ed9-a29b-2c01a68526ce', 'D', 'EOI', 'California red-legged frog FWS notes'),
    (27, '459668c5-8725-4aa8-8529-d73621d54e4c', 'f9d46a4f-cb95-4517-9bd8-4502007fb6a5', 'C', 'EOI', 'Arab dhow replica materials notes')
),

-- Resolve the target RW/M2/HARD module row for Practice Test 6.
target_module AS (
  SELECT ptm.id AS module_id
  FROM practice_test_modules ptm
  JOIN practice_tests pt ON pt.id = ptm.practice_test_id
  WHERE pt.name = 'SAT Practice Test 6 (Adaptive)'
    AND ptm.subject_code = 'RW'
    AND ptm.module_number = 2
    AND ptm.route_code = 'HARD'
),

-- Match expected.external_id → questions.source_external_id first,
-- then expected.question_cb_id → questions.question_id as a fallback.
matched AS (
  SELECT
    e.ordinal,
    e.external_id,
    e.question_cb_id,
    e.correct_choice,
    e.primary_cd,
    e.hint,
    COALESCE(q_ext.id, q_qid.id) AS question_uuid,
    CASE
      WHEN q_ext.id IS NOT NULL THEN 'source_external_id'
      WHEN q_qid.id IS NOT NULL THEN 'question_id'
      ELSE NULL
    END AS matched_by
  FROM expected e
  LEFT JOIN questions q_ext ON q_ext.source_external_id = e.external_id
  LEFT JOIN questions q_qid ON q_qid.question_id      = e.question_cb_id
),

-- Count how often each candidate version is already referenced by
-- OTHER practice_test_module_items rows. Higher usage means we're
-- picking a version that's actively in use elsewhere, not an orphan.
version_usage AS (
  SELECT
    qv.id AS version_id,
    qv.question_id AS question_uuid,
    (SELECT count(*)
       FROM practice_test_module_items ptmi
      WHERE ptmi.question_version_id = qv.id) AS usage_count
  FROM question_versions qv
  WHERE qv.question_id IN (
    SELECT question_uuid FROM matched WHERE question_uuid IS NOT NULL
  )
),

-- For each question, pick the version with the highest usage count
-- (ties broken by id so the pick is deterministic).
best_version AS (
  SELECT DISTINCT ON (question_uuid)
    question_uuid,
    version_id,
    usage_count
  FROM version_usage
  ORDER BY question_uuid, usage_count DESC, version_id
),

-- What's currently sitting at each ordinal in the target module.
current_items AS (
  SELECT ordinal, id AS item_id, question_version_id AS current_version
  FROM practice_test_module_items
  WHERE practice_test_module_id = (SELECT module_id FROM target_module)
)

SELECT
  m.ordinal,
  m.hint,
  m.primary_cd,
  COALESCE(m.matched_by, 'UNMATCHED') AS matched_by,
  m.question_uuid,
  bv.version_id  AS new_version_id,
  bv.usage_count AS new_version_usage,
  ci.current_version,
  CASE
    WHEN m.question_uuid IS NULL                       THEN '✗ UNMATCHED'
    WHEN bv.version_id   IS NULL                       THEN '✗ NO_VERSION'
    WHEN ci.current_version = bv.version_id            THEN '✓ ALREADY_CORRECT'
    ELSE '→ WILL_UPDATE'
  END AS status
FROM matched m
LEFT JOIN best_version bv ON bv.question_uuid = m.question_uuid
LEFT JOIN current_items ci ON ci.ordinal      = m.ordinal
ORDER BY m.ordinal;
