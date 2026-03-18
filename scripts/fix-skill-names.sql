-- Fix missing skill_name values in question_taxonomy for Reading & Writing skills.
-- Only updates rows where skill_name IS NULL or empty string.
-- Run the SELECT first to preview, then the UPDATE.

-- 1. Preview: show all rows that will be updated
SELECT
  question_id,
  skill_code,
  skill_name AS current_skill_name,
  CASE skill_code
    WHEN 'CTC' THEN 'Cross-Text Connections'
    WHEN 'BOU' THEN 'Boundaries'
    WHEN 'CID' THEN 'Central Ideas and Details'
    WHEN 'COE' THEN 'Command of Evidence'
    WHEN 'FSS' THEN 'Form, Structure, and Sense'
    WHEN 'INF' THEN 'Inferences'
    WHEN 'SYN' THEN 'Rhetorical Synthesis'
    WHEN 'TRA' THEN 'Transitions'
    WHEN 'TSP' THEN 'Text Structure and Purpose'
    WHEN 'WIC' THEN 'Words in Context'
  END AS new_skill_name,
  domain_name
FROM question_taxonomy
WHERE skill_code IN ('CTC', 'BOU', 'CID', 'COE', 'FSS', 'INF', 'SYN', 'TRA', 'TSP', 'WIC')
  AND (skill_name IS NULL OR skill_name = '')
ORDER BY skill_code, question_id;

-- 2. Update
UPDATE question_taxonomy
SET skill_name = CASE skill_code
    WHEN 'CTC' THEN 'Cross-Text Connections'
    WHEN 'BOU' THEN 'Boundaries'
    WHEN 'CID' THEN 'Central Ideas and Details'
    WHEN 'COE' THEN 'Command of Evidence'
    WHEN 'FSS' THEN 'Form, Structure, and Sense'
    WHEN 'INF' THEN 'Inferences'
    WHEN 'SYN' THEN 'Rhetorical Synthesis'
    WHEN 'TRA' THEN 'Transitions'
    WHEN 'TSP' THEN 'Text Structure and Purpose'
    WHEN 'WIC' THEN 'Words in Context'
  END
WHERE skill_code IN ('CTC', 'BOU', 'CID', 'COE', 'FSS', 'INF', 'SYN', 'TRA', 'TSP', 'WIC')
  AND (skill_name IS NULL OR skill_name = '');
