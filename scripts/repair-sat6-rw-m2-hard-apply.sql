-- ═══════════════════════════════════════════════════════════════════════
-- SAT Practice Test 6 RW M2 Hard repair — APPLY
-- ═══════════════════════════════════════════════════════════════════════
-- Run AFTER repair-sat6-rw-m2-hard-preview.sql returns 27 matched rows
-- with only ✓ ALREADY_CORRECT and → WILL_UPDATE statuses. If any row
-- reports ✗ UNMATCHED or ✗ NO_VERSION, STOP — you'll need to import
-- those questions before this script can fix the module.
--
-- How to run safely in Supabase SQL Editor:
--
--   1. Paste the whole file into a new query.
--   2. Run it as-is. Because it's wrapped in BEGIN; ... ROLLBACK;
--      the UPDATE executes, the RETURNING + verification SELECTs run
--      inside the transaction, and then everything rolls back. This
--      lets you see exactly what WOULD change without committing.
--   3. Review the two result grids that come back. The first shows
--      the rows that were rewritten (with their new version ids).
--      The second shows the full final state of the module's 27
--      items — every row should be tagged RW/CAS/INI/SEC/EOI.
--   4. If that all looks right, change the trailing `ROLLBACK;` to
--      `COMMIT;` and re-run.
--
-- Attempts safety: this script does NOT touch any attempt rows.
-- Existing attempts against the broken module will end up linked to
-- orphaned question_version_ids after the repair commits — see the
-- cleanup query at the bottom of this file for how to delete them.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

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

target_module AS (
  SELECT ptm.id AS module_id
  FROM practice_test_modules ptm
  JOIN practice_tests pt ON pt.id = ptm.practice_test_id
  WHERE pt.name = 'SAT Practice Test 6 (Adaptive)'
    AND ptm.subject_code = 'RW'
    AND ptm.module_number = 2
    AND ptm.route_code = 'HARD'
),

matched AS (
  SELECT
    e.ordinal,
    COALESCE(q_ext.id, q_qid.id) AS question_uuid
  FROM expected e
  LEFT JOIN questions q_ext ON q_ext.source_external_id = e.external_id
  LEFT JOIN questions q_qid ON q_qid.question_id      = e.question_cb_id
),

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

best_version AS (
  SELECT DISTINCT ON (question_uuid)
    question_uuid,
    version_id
  FROM version_usage
  ORDER BY question_uuid, usage_count DESC, version_id
),

-- Final mapping: ordinal → new version id. Any row that fails to match
-- or fails to resolve a version is silently excluded from the UPDATE —
-- run the preview script first to confirm all 27 are resolvable.
repair AS (
  SELECT m.ordinal, bv.version_id AS new_version_id
  FROM matched m
  JOIN best_version bv ON bv.question_uuid = m.question_uuid
)

UPDATE practice_test_module_items ptmi
   SET question_version_id = repair.new_version_id
  FROM repair
 WHERE ptmi.practice_test_module_id = (SELECT module_id FROM target_module)
   AND ptmi.ordinal = repair.ordinal
   AND ptmi.question_version_id IS DISTINCT FROM repair.new_version_id
RETURNING
  ptmi.ordinal,
  ptmi.question_version_id AS new_version_id;

-- ── verification: show the final state of all 27 module items ───────
SELECT
  ptmi.ordinal,
  ptmi.question_version_id,
  qt.domain_name,
  qt.domain_code
FROM practice_test_module_items ptmi
JOIN question_versions qv    ON qv.id = ptmi.question_version_id
LEFT JOIN question_taxonomy qt ON qt.question_id = qv.question_id
WHERE ptmi.practice_test_module_id = (
  SELECT ptm.id
    FROM practice_test_modules ptm
    JOIN practice_tests pt ON pt.id = ptm.practice_test_id
   WHERE pt.name = 'SAT Practice Test 6 (Adaptive)'
     AND ptm.subject_code = 'RW'
     AND ptm.module_number = 2
     AND ptm.route_code = 'HARD'
)
ORDER BY ptmi.ordinal;

-- ═══════════════════════════════════════════════════════════════════════
-- DRY RUN by default. Change this to COMMIT; once you've reviewed
-- the two result grids above and everything looks correct.
-- ═══════════════════════════════════════════════════════════════════════
ROLLBACK;


-- ═══════════════════════════════════════════════════════════════════════
-- OPTIONAL — Cleanup of polluted attempts against the old module content
-- ═══════════════════════════════════════════════════════════════════════
-- Run this AFTER committing the repair above. It deletes the single
-- Bluebook-upload attempt that surfaced this bug (and any other attempts
-- against the broken RW/M2/HARD module), along with their downstream
-- item attempts and linked answer rows. Idempotent — safe to re-run.
--
-- Wrap in BEGIN; ... ROLLBACK; to dry-run, the same way as above.
-- ═══════════════════════════════════════════════════════════════════════
--
-- BEGIN;
--
-- WITH target_module AS (
--   SELECT ptm.id AS module_id
--   FROM practice_test_modules ptm
--   JOIN practice_tests pt ON pt.id = ptm.practice_test_id
--   WHERE pt.name = 'SAT Practice Test 6 (Adaptive)'
--     AND ptm.subject_code = 'RW'
--     AND ptm.module_number = 2
--     AND ptm.route_code = 'HARD'
-- ),
-- broken_module_attempts AS (
--   SELECT id
--   FROM practice_test_module_attempts
--   WHERE practice_test_module_id = (SELECT module_id FROM target_module)
-- ),
-- broken_item_attempts AS (
--   DELETE FROM practice_test_item_attempts
--    WHERE practice_test_module_attempt_id IN (SELECT id FROM broken_module_attempts)
--   RETURNING attempt_id
-- ),
-- broken_attempts AS (
--   DELETE FROM attempts
--    WHERE id IN (SELECT attempt_id FROM broken_item_attempts)
--   RETURNING id
-- )
-- DELETE FROM practice_test_module_attempts
--  WHERE id IN (SELECT id FROM broken_module_attempts);
--
-- -- Review the output row counts, then:
-- -- COMMIT;
-- -- or:
-- -- ROLLBACK;
