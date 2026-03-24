-- Add category_code and subcategory_code to act_questions
alter table act_questions add column if not exists category_code text;
alter table act_questions add column if not exists subcategory_code text;

-- Replace the name-based category index with code-based ones
drop index if exists idx_act_questions_category;
create index idx_act_questions_category on act_questions (section, category_code);
create index idx_act_questions_subcategory on act_questions (section, category_code, subcategory_code);
