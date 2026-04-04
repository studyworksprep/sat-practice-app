-- Add domain score band columns to sat_official_scores
-- These store the 1-7 score band for each of the 8 SAT domains (4 R&W + 4 Math)
-- as reported on official score reports.

-- Reading & Writing domains
alter table sat_official_scores add column if not exists domain_ini integer check (domain_ini between 1 and 7);  -- Information and Ideas
alter table sat_official_scores add column if not exists domain_cas integer check (domain_cas between 1 and 7);  -- Craft and Structure
alter table sat_official_scores add column if not exists domain_eoi integer check (domain_eoi between 1 and 7);  -- Expression of Ideas
alter table sat_official_scores add column if not exists domain_sec integer check (domain_sec between 1 and 7);  -- Standard English Conventions

-- Math domains
alter table sat_official_scores add column if not exists domain_alg integer check (domain_alg between 1 and 7);  -- Algebra
alter table sat_official_scores add column if not exists domain_atm integer check (domain_atm between 1 and 7);  -- Advanced Math
alter table sat_official_scores add column if not exists domain_pam integer check (domain_pam between 1 and 7);  -- Problem-Solving and Data Analysis
alter table sat_official_scores add column if not exists domain_geo integer check (domain_geo between 1 and 7);  -- Geometry and Trigonometry
