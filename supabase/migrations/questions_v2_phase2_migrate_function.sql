-- =========================================================
-- Phase 2: Batch migration function
-- =========================================================
-- Creates a function to migrate existing questions into questions_v2
-- in batches. Safe to run multiple times — only migrates questions
-- that haven't been mapped yet.
--
-- Usage (in Supabase SQL editor):
--   SELECT * FROM migrate_questions_batch(100);  -- migrate next 100
--
-- Returns: (migrated_count int, total_remaining int)

CREATE OR REPLACE FUNCTION public.migrate_questions_batch(batch_size int DEFAULT 100)
RETURNS TABLE (migrated_count int, total_remaining int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  migrated int := 0;
  remaining int;
  q RECORD;
  v RECORD;
  new_id uuid;
  options_json jsonb;
  correct_json jsonb;
BEGIN
  -- No auth check: this function is only callable via SQL editor
  -- (which requires Supabase project admin access)

  -- Get the next batch of unmigrated questions.
  -- NB: alias the source table as `qs` (not `q`) to avoid colliding with
  -- the declared RECORD variable `q` — PL/pgSQL would otherwise resolve
  -- `q.id` to the (not-yet-assigned) record variable and raise
  -- "record \"q\" is not assigned yet".
  FOR q IN
    SELECT qs.id, qs.question_id AS source_id, qs.source_external_id, qs.is_broken
    FROM questions qs
    LEFT JOIN question_id_map m ON m.old_question_id = qs.id
    WHERE m.old_question_id IS NULL
    ORDER BY qs.id
    LIMIT batch_size
  LOOP
    -- Get the current version for this question
    SELECT qv.id, qv.question_type, qv.stem_html, qv.stimulus_html,
           qv.rationale_html, qv.attempt_count, qv.correct_count
    INTO v
    FROM question_versions qv
    WHERE qv.question_id = q.id AND qv.is_current = true
    LIMIT 1;

    -- Skip if no current version
    IF v.id IS NULL THEN
      CONTINUE;
    END IF;

    -- Build options JSON (for MCQ)
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'label', label,
          'ordinal', ordinal,
          'content_html', content_html
        ) ORDER BY ordinal
      ),
      NULL
    )
    INTO options_json
    FROM answer_options
    WHERE question_version_id = v.id;

    -- Build correct_answer JSON.
    -- Resolve option UUIDs → labels so the new schema is self-contained
    -- (the options jsonb only carries {label, ordinal, content_html} and
    -- does not preserve the old answer_options UUIDs).
    SELECT jsonb_build_object(
      'option_label', (
        SELECT ao.label FROM answer_options ao
        WHERE ao.id = ca.correct_option_id
      ),
      'option_labels', (
        SELECT coalesce(jsonb_agg(ao.label ORDER BY ao.ordinal), NULL)
        FROM answer_options ao
        WHERE ao.id = ANY (ca.correct_option_ids)
      ),
      'text', ca.correct_text,
      'number', ca.correct_number,
      'tolerance', ca.numeric_tolerance
    )
    INTO correct_json
    FROM correct_answers ca
    WHERE ca.question_version_id = v.id
    LIMIT 1;

    -- Insert into questions_v2
    INSERT INTO questions_v2 (
      question_type, stem_html, stimulus_html, rationale_html,
      options, correct_answer,
      domain_code, domain_name, skill_code, skill_name, difficulty, score_band,
      source, source_id, source_external_id,
      is_broken, attempt_count, correct_count
    )
    SELECT
      v.question_type, v.stem_html, v.stimulus_html, v.rationale_html,
      options_json, correct_json,
      t.domain_code, t.domain_name, t.skill_code, t.skill_name, t.difficulty, t.score_band,
      'collegeboard', q.source_id, q.source_external_id,
      q.is_broken, coalesce(v.attempt_count, 0), coalesce(v.correct_count, 0)
    FROM question_taxonomy t
    WHERE t.question_id = q.id
    RETURNING id INTO new_id;

    -- If no taxonomy row existed, insert without taxonomy fields
    IF new_id IS NULL THEN
      INSERT INTO questions_v2 (
        question_type, stem_html, stimulus_html, rationale_html,
        options, correct_answer,
        source, source_id, source_external_id,
        is_broken, attempt_count, correct_count
      ) VALUES (
        v.question_type, v.stem_html, v.stimulus_html, v.rationale_html,
        options_json, correct_json,
        'collegeboard', q.source_id, q.source_external_id,
        q.is_broken, coalesce(v.attempt_count, 0), coalesce(v.correct_count, 0)
      )
      RETURNING id INTO new_id;
    END IF;

    -- Record the mapping
    INSERT INTO question_id_map (old_question_id, old_version_id, new_question_id)
    VALUES (q.id, v.id, new_id);

    migrated := migrated + 1;
  END LOOP;

  -- Count how many questions still need migration.
  -- Same aliasing note as above: use `qs` to avoid colliding with the
  -- declared RECORD variable `q`.
  SELECT COUNT(*) INTO remaining
  FROM questions qs
  LEFT JOIN question_id_map m ON m.old_question_id = qs.id
  WHERE m.old_question_id IS NULL;

  RETURN QUERY SELECT migrated, remaining;
END;
$$;

-- Helper: preview what would be migrated without actually migrating
CREATE OR REPLACE FUNCTION public.migration_status()
RETURNS TABLE (
  total_questions bigint,
  migrated_questions bigint,
  remaining_questions bigint,
  questions_without_current_version bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM questions) AS total_questions,
    (SELECT COUNT(*) FROM question_id_map) AS migrated_questions,
    (SELECT COUNT(*) FROM questions q LEFT JOIN question_id_map m ON m.old_question_id = q.id WHERE m.old_question_id IS NULL) AS remaining_questions,
    (SELECT COUNT(*) FROM questions q WHERE NOT EXISTS (SELECT 1 FROM question_versions qv WHERE qv.question_id = q.id AND qv.is_current = true)) AS questions_without_current_version;
$$;
