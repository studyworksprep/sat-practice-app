-- Add highlight_ref column to act_questions for English passage questions.
-- Stores the question reference number (e.g. the underline number) to highlight
-- in the shared stimulus_html passage when this question is displayed.
alter table act_questions add column if not exists highlight_ref integer;
