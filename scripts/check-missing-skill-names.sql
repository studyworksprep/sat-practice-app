-- Count questions with NULL or empty skill_name, grouped by skill_code
SELECT
  skill_code,
  COUNT(*) AS missing_count
FROM question_taxonomy
WHERE skill_name IS NULL OR skill_name = ''
GROUP BY skill_code
ORDER BY missing_count DESC;

-- Total count
SELECT COUNT(*) AS total_missing
FROM question_taxonomy
WHERE skill_name IS NULL OR skill_name = '';
