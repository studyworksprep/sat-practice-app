// Admin → ACT → Imports → [jobId].
//
// Per-job status page. Shows the uploaded files (with signed-URL
// download links for verification), the per-section parser
// status, and the trigger buttons that fire each section parser
// (PR 10b adds the wired actions; PR 10a renders disabled
// placeholders so the layout is in place when 10b lands).
//
// When all 5 parses (4 sections + scale conversion) finish, a
// "Open review" button surfaces to send the admin to the drafts
// review page (PR 10c).

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { sectionLabel } from '@/lib/practice/act-taxonomy';
import s from '../Imports.module.css';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  uploaded: 'Uploaded',
  parsing: 'Parsing',
  ready_for_review: 'Ready for review',
  completed: 'Completed',
  failed: 'Failed',
};

const PARSE_STATUS_LABEL = {
  pending: 'Pending',
  running: 'Running…',
  completed: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
};

const SECTION_KEYS = ['english', 'math', 'reading', 'science'];

export default async function ImportJobStatusPage({ params }) {
  const { jobId } = await params;

  let supabase;
  try {
    ({ supabase } = await requireRole(['admin']));
  } catch {
    redirect('/');
  }

  const { data: job } = await supabase
    .from('act_import_jobs')
    .select(
      'id, source_test, status, test_pdf_url, math_html_url, answer_key_url, scale_url, ' +
      'english_status, math_status, reading_status, science_status, scale_status, ' +
      'log_json, created_at, updated_at',
    )
    .eq('id', jobId)
    .maybeSingle();
  if (!job) notFound();

  // How many drafts has the job produced so far? Lets the page
  // surface "12 drafts ready" without waiting for the review-page
  // link to appear.
  const { count: draftsCount } = await supabase
    .from('act_question_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('import_job_id', jobId);

  // Signed-URL helpers for the four uploaded files so the admin
  // can re-verify the upload landed correctly. 5 min expiry is
  // plenty for a click-through download.
  const signedUrls = await Promise.all(
    [
      ['test_pdf_url',   job.test_pdf_url],
      ['math_html_url',  job.math_html_url],
      ['answer_key_url', job.answer_key_url],
      ['scale_url',      job.scale_url],
    ].map(async ([slot, path]) => {
      if (!path) return [slot, null];
      const { data } = await supabase.storage
        .from('act-imports')
        .createSignedUrl(path, 300);
      return [slot, data?.signedUrl ?? null];
    }),
  );
  const urls = Object.fromEntries(signedUrls);

  const allSectionsDone = SECTION_KEYS.every(
    (k) => job[`${k}_status`] === 'completed' || job[`${k}_status`] === 'skipped',
  );

  return (
    <main className={s.container}>
      <header className={s.header}>
        <Link href="/admin/act/imports" className={s.backLink}>
          ← All imports
        </Link>
        <div className={s.titleRow}>
          <div>
            <h1 className={s.h1}>{job.source_test}</h1>
            <p className={s.sub}>
              Created {formatDate(job.created_at)} ·{' '}
              <span className={`${s.statusPill} ${s[`statusPill_${job.status}`] ?? ''}`}>
                {STATUS_LABEL[job.status] ?? job.status}
              </span>
            </p>
          </div>
          {allSectionsDone && draftsCount > 0 && (
            <Link href={`/admin/act/imports/${jobId}/review`} className={s.btnPrimary}>
              Open review · {draftsCount} draft{draftsCount === 1 ? '' : 's'} →
            </Link>
          )}
        </div>
      </header>

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.h2}>Uploaded files</div>
        </div>
        <ul className={s.fileList}>
          <FileRow label="Whole-test PDF"          path={job.test_pdf_url}    href={urls.test_pdf_url} />
          <FileRow label="Math (Mathpix HTML)"     path={job.math_html_url}   href={urls.math_html_url} />
          <FileRow label="Answer key"              path={job.answer_key_url}  href={urls.answer_key_url} />
          <FileRow label="Score conversion"        path={job.scale_url}       href={urls.scale_url} />
        </ul>
      </section>

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Parse sections</div>
            <div className={s.cardHint}>
              Each button kicks off a Claude vision pass over the
              uploaded files for that section, writing drafts as
              it goes. PR 10b wires these up; for now they show
              the current status only.
            </div>
          </div>
        </div>

        <div className={s.parseGrid}>
          {SECTION_KEYS.map((sec) => (
            <ParseTile
              key={sec}
              label={sectionLabel(sec)}
              status={job[`${sec}_status`]}
              disabled
              note="Parser wires up in PR 10b"
            />
          ))}
          <ParseTile
            label="Score conversion"
            status={job.scale_status}
            disabled
            note="Parser wires up in PR 10b"
          />
        </div>
      </section>

      {Array.isArray(job.log_json) && job.log_json.length > 0 && (
        <section className={s.card}>
          <div className={s.cardHeader}>
            <div className={s.h2}>Parse log</div>
          </div>
          <ul className={s.logList}>
            {job.log_json.map((entry, i) => (
              <li key={i} className={s.logRow}>
                <span className={s.logTs}>
                  {entry.ts ? new Date(entry.ts).toLocaleString() : ''}
                </span>
                <span className={`${s.logLevel} ${s[`logLevel_${entry.level}`] ?? ''}`}>
                  {entry.level ?? 'info'}
                </span>
                <span className={s.logMessage}>{entry.message ?? ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function FileRow({ label, path, href }) {
  return (
    <li className={s.fileRow}>
      <span className={s.fileLabel}>{label}</span>
      {path ? (
        <a href={href} target="_blank" rel="noreferrer" className={s.fileLink}>
          {path.split('/').slice(1).join('/')} ↗
        </a>
      ) : (
        <span className={s.fileMissing}>not uploaded</span>
      )}
    </li>
  );
}

function ParseTile({ label, status, disabled, note }) {
  return (
    <div className={s.parseTile}>
      <div className={s.parseTileHeader}>
        <span className={s.parseTileLabel}>{label}</span>
        <span className={`${s.parseStatus} ${s[`parseStatus_${status}`] ?? ''}`}>
          {PARSE_STATUS_LABEL[status] ?? status}
        </span>
      </div>
      <button type="button" className={s.btnSecondary} disabled={disabled}>
        Parse
      </button>
      {note && <div className={s.parseTileNote}>{note}</div>}
    </div>
  );
}
