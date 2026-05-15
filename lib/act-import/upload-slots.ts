// Shared slot config for ACT-import file uploads.
//
// Used at create time (imports/actions.ts → createImportJob)
// and after the fact (imports/[jobId]/actions.ts → addJobFile),
// so the two paths agree on the validation regex, the storage-
// column mapping, and the size cap.

/** Allowed inputs per file slot. PDF slots are strict so a
 *  stray image upload fails loudly; HTML slots accept both
 *  .html and .htm extensions. */
export const ALLOWED_EXT: Record<string, RegExp> = {
  test_pdf:     /\.pdf$/i,
  math_html:    /\.html?$/i,
  science_html: /\.html?$/i,
  answer_key:   /\.pdf$/i,
  scale:        /\.pdf$/i,
};

/** Column name on act_import_jobs that records the bucket path
 *  for each slot. */
export const SLOT_TO_COLUMN: Record<string, string> = {
  test_pdf:     'test_pdf_url',
  math_html:    'math_html_url',
  science_html: 'science_html_url',
  answer_key:   'answer_key_url',
  scale:        'scale_url',
};

/** Per-file size limit. 50 MB sits well above a typical ACT
 *  test PDF or Mathpix HTML export. */
export const SIZE_LIMIT = 50 * 1024 * 1024;

/** Human-facing labels for the slots — used by status-page UI
 *  to render "Upload {label}" buttons consistently with the
 *  initial-upload form. */
export const SLOT_LABEL: Record<string, string> = {
  test_pdf:     'Whole-test PDF',
  math_html:    'Math Mathpix HTML',
  science_html: 'Science Mathpix HTML',
  answer_key:   'Answer key',
  scale:        'Score conversion',
};

export const BUCKET = 'act-imports';
