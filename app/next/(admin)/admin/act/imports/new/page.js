// Admin → ACT → Imports → New.
//
// Upload form for a brand-new ACT test import job. Admin enters
// the source_test identifier and uploads any of four files:
//   - test.pdf:      the whole-test PDF (English, Math, Reading,
//                    Science all in one document)
//   - math.html:     Mathpix HTML export of the math section.
//                    Optional, but the math parser uses it as the
//                    structured source when present.
//   - answer-key.pdf: the per-section A/B/C/D answer key
//   - scale.pdf:     raw → scaled conversion table per section
//
// Submitting creates an act_import_jobs row, uploads each file to
// act-imports/{jobId}/ in the private storage bucket, and
// redirects to the status page where per-section parsers are
// triggered (PR 10b).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { createImportJob } from '../actions';
import { UploadForm } from './UploadForm';
import s from '../Imports.module.css';

export const dynamic = 'force-dynamic';

export default async function NewImportPage() {
  try {
    await requireRole(['admin']);
  } catch {
    redirect('/');
  }

  return (
    <main className={s.container}>
      <header className={s.header}>
        <Link href="/admin/act/imports" className={s.backLink}>
          ← All imports
        </Link>
        <h1 className={s.h1}>New ACT test import</h1>
        <p className={s.sub}>
          Upload the source files for one ACT form. After this
          page you&apos;ll get a status page with per-section parse
          buttons. Files are stored privately and accessible only
          to admins.
        </p>
      </header>

      <UploadForm createAction={createImportJob} />
    </main>
  );
}
