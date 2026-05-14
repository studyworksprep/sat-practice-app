-- =========================================================
-- act_import_jobs — add science_html_url upload slot
-- =========================================================
-- PR 10a's act_import_jobs table carried four upload slots:
-- test_pdf_url, math_html_url, answer_key_url, scale_url. The
-- math_html_url slot accepts the Mathpix HTML export of the
-- math section, which PR 11b's parser also processes for
-- embedded figures + LaTeX.
--
-- Science is structurally similar to math from an OCR
-- standpoint: many embedded figures (graphs, tables of data,
-- chemistry diagrams) and the occasional math-like notation
-- (chemical formulas, exponents, units). Running Mathpix over
-- the science section produces clean HTML with figures inlined
-- as data URLs and any math-like notation in LaTeX — exactly
-- what the Mathpix-figures rehoster + science parser want as a
-- structured source alongside the test PDF.
--
-- This migration is the schema half of PR 11c. The upload form
-- + status page + actions follow in the same commit; the
-- parser then conditionally pulls science_html_url and runs it
-- through rehostMathpixFigures() the same way the math parser
-- does for math_html_url.

alter table public.act_import_jobs
  add column if not exists science_html_url text;

-- Refresh PostgREST so the new column serves immediately.
notify pgrst, 'reload schema';
